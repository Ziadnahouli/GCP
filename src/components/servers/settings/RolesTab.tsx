'use client';

import * as React from 'react';
import {
  Shield,
  Plus,
  Trash2,
  Save,
  Check,
  AlertCircle,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Server,
  RoleDefinition,
  ServerPermission,
  ALL_SERVER_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
} from '@/lib/types/server';
import { DEFAULT_ROLE_COLORS, ROLE_PRESET_COLORS } from '@/lib/design/colors';
import { DeleteRoleDialog } from './DeleteRoleDialog';
import { ToastItem } from '@/components/ui/toast';

interface RolesTabProps {
  server: Server;
  canManageRoles: boolean;
  userHighestRoleRank: number;
  toast: (options: Omit<ToastItem, 'id'>) => void;
  onCreateRole?: (serverId: string, name: string, color: string, permissions: ServerPermission[]) => Promise<unknown>;
  onUpdateRole?: (serverId: string, roleId: string, updates: Partial<RoleDefinition>) => Promise<unknown>;
  onDeleteRole?: (serverId: string, roleId: string) => Promise<unknown>;
  onUpdateRolePermissions?: (serverId: string, roleIdOrName: string, permissions: ServerPermission[]) => Promise<unknown>;
}

const PERMISSION_GROUPS: {
  title: string;
  permissions: { key: ServerPermission; label: string; description: string }[];
}[] = [
  {
    title: 'General Server Management',
    permissions: [
      { key: 'manage_server', label: 'Manage Server', description: 'Change server name, description, and icon.' },
      { key: 'manage_channels', label: 'Manage Channels', description: 'Create, edit, reorder, and delete channels.' },
      { key: 'manage_roles', label: 'Manage Roles', description: 'Create, modify, and assign lower-ranked roles.' },
      { key: 'view_audit_log', label: 'View Audit Log', description: 'View moderation actions and server changes.' },
      { key: 'manage_reports', label: 'Manage Reports', description: 'Review, resolve, or dismiss user reports.' },
    ],
  },
  {
    title: 'Membership & Moderation',
    permissions: [
      { key: 'create_invites', label: 'Create Invites', description: 'Generate invite links for new members.' },
      { key: 'manage_invites', label: 'Manage Invites', description: 'View and revoke active server invites.' },
      { key: 'kick_members', label: 'Kick Members', description: 'Remove lower-ranked members from the server.' },
      { key: 'ban_members', label: 'Ban Members', description: 'Permanently ban lower-ranked members from the server.' },
      { key: 'moderate_members', label: 'Timeout Members', description: 'Temporarily mute and restrict members.' },
    ],
  },
  {
    title: 'Text Permissions',
    permissions: [
      { key: 'send_messages', label: 'Send Messages', description: 'Post text messages in text channels.' },
      { key: 'send_attachments', label: 'Send Attachments', description: 'Upload images, videos, and files in chat.' },
      { key: 'mention_everyone', label: 'Mention @everyone', description: 'Notify all members in the server.' },
      { key: 'manage_messages', label: 'Manage Messages', description: 'Delete messages sent by other members.' },
    ],
  },
  {
    title: 'Voice Permissions',
    permissions: [
      { key: 'connect_voice', label: 'Connect to Voice', description: 'Join voice channels in this server.' },
      { key: 'speak_voice', label: 'Speak in Voice', description: 'Transmit microphone audio in voice channels.' },
      { key: 'share_screen', label: 'Share Screen', description: 'Stream video and screens in voice channels.' },
      { key: 'use_soundboard', label: 'Use Soundboard', description: 'Play soundboard audio clips in voice channels.' },
    ],
  },
];

export function RolesTab({
  server,
  canManageRoles,
  userHighestRoleRank,
  toast,
  onCreateRole,
  onUpdateRole,
  onDeleteRole,
  onUpdateRolePermissions,
}: RolesTabProps) {
  const roles = server.roles || [];

  // Currently selected role
  const [selectedRoleId, setSelectedRoleId] = React.useState<string>(
    roles[0]?.id || 'admin'
  );

  // Draft permissions per role id
  const [permDrafts, setPermDrafts] = React.useState<Record<string, ServerPermission[]>>({});
  const [savingPerms, setSavingPerms] = React.useState(false);

  // Create role state
  const [showCreate, setShowCreate] = React.useState(false);
  const [newRoleName, setNewRoleName] = React.useState('');
  const [newRoleColor, setNewRoleColor] = React.useState<string>(DEFAULT_ROLE_COLORS.defaultNewRole);
  const [newRolePerms, setNewRolePerms] = React.useState<ServerPermission[]>([
    'send_messages',
    'send_attachments',
    'connect_voice',
    'speak_voice',
  ]);
  const [creating, setCreating] = React.useState(false);

  // Delete role dialog state
  const [deletingRole, setDeletingRole] = React.useState<RoleDefinition | null>(null);

  const activeRole = roles.find((r) => r.id === selectedRoleId) || roles[0];

  const getRolePermissions = (roleId: string): ServerPermission[] => {
    if (permDrafts[roleId]) {
      return permDrafts[roleId];
    }
    const r = roles.find((item) => item.id === roleId);
    return r ? r.permissions : [];
  };

  const handleTogglePerm = (perm: ServerPermission) => {
    if (!activeRole) return;
    const current = getRolePermissions(activeRole.id);
    const updated = current.includes(perm)
      ? current.filter((p) => p !== perm)
      : [...current, perm];

    setPermDrafts((prev) => ({
      ...prev,
      [activeRole.id]: updated,
    }));
  };

  const handleSavePermissions = async () => {
    if (!activeRole) return;
    const perms = getRolePermissions(activeRole.id);
    setSavingPerms(true);
    try {
      if (onUpdateRolePermissions) {
        await onUpdateRolePermissions(server.id, activeRole.id, perms);
      }
      toast({
        title: 'Permissions Saved',
        description: `Updated permissions for "${activeRole.name}".`,
        type: 'success',
      });
    } catch {
      toast({
        title: 'Update Failed',
        description: 'Failed to save role permissions.',
        type: 'error',
      });
    } finally {
      setSavingPerms(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newRoleName.trim();
    if (!trimmed || trimmed.length > 50) {
      toast({
        title: 'Invalid Role Name',
        description: 'Role name must be between 1 and 50 characters.',
        type: 'error',
      });
      return;
    }

    setCreating(true);
    try {
      if (onCreateRole) {
        await onCreateRole(server.id, trimmed, newRoleColor, newRolePerms);
      }
      setShowCreate(false);
      setNewRoleName('');
      setNewRoleColor(DEFAULT_ROLE_COLORS.defaultNewRole);
      setNewRolePerms(['send_messages', 'send_attachments', 'connect_voice', 'speak_voice']);
      toast({
        title: 'Role Created',
        description: `Role "${trimmed}" created successfully.`,
        type: 'success',
      });
    } catch {
      toast({
        title: 'Creation Failed',
        description: 'Failed to create role. Name must be unique within the server.',
        type: 'error',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingRole) return;
    try {
      if (onDeleteRole) {
        await onDeleteRole(server.id, deletingRole.id);
      }
      if (selectedRoleId === deletingRole.id) {
        setSelectedRoleId(roles[0]?.id || '');
      }
      toast({
        title: 'Role Deleted',
        description: `Role "${deletingRole.name}" deleted. Members reassigned to Member.`,
        type: 'success',
      });
    } catch (err: unknown) {
      toast({
        title: 'Deletion Failed',
        description: (err as Error)?.message || 'Failed to delete role.',
        type: 'error',
      });
    }
  };

  const activePerms = activeRole ? getRolePermissions(activeRole.id) : [];
  const isOwnerRole = activeRole?.name.toLowerCase() === 'owner';
  const isEditable = canManageRoles && !isOwnerRole && (userHighestRoleRank > (activeRole?.position ?? 0) || userHighestRoleRank >= 999);
  const isDirty = activeRole && Boolean(permDrafts[activeRole.id]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Roles & Permissions</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define hierarchy, assign colors, and configure access permissions.
          </p>
        </div>
        {canManageRoles && !showCreate && (
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            className="text-xs gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Role
          </Button>
        )}
      </div>

      {/* Create Role Modal/Panel */}
      {showCreate && (
        <form
          onSubmit={handleCreateSubmit}
          className="p-4 rounded-xl border border-border bg-card/60 space-y-4 animate-in fade-in duration-150"
        >
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Create Custom Role
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Role Name</label>
              <Input
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="e.g. VIP, Coach, Captain"
                maxLength={50}
                required
                className="text-xs"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Role Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newRoleColor}
                  onChange={(e) => setNewRoleColor(e.target.value)}
                  className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                />
                <div className="flex gap-1.5 flex-wrap">
                  {ROLE_PRESET_COLORS.slice(0, 6).map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewRoleColor(color)}
                      style={{ backgroundColor: color }}
                      className={`w-6 h-6 rounded-full border transition-transform ${
                        newRoleColor.toLowerCase() === color.toLowerCase()
                          ? 'scale-110 border-white shadow-sm'
                          : 'border-transparent hover:scale-105'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={creating}
              onClick={() => {
                setShowCreate(false);
                setNewRoleName('');
              }}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={creating} className="text-xs">
              {creating ? 'Creating...' : 'Create Role'}
            </Button>
          </div>
        </form>
      )}

      {/* Main Roles Manager Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Roles List */}
        <div className="space-y-1.5 md:border-r md:border-border md:pr-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-2">
            Server Roles ({roles.length})
          </div>
          <div className="space-y-1 max-h-[460px] overflow-y-auto pr-1">
            {roles.map((role) => {
              const isSelected = selectedRoleId === role.id;
              return (
                <div
                  key={role.id}
                  onClick={() => setSelectedRoleId(role.id)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left cursor-pointer transition-colors text-xs ${
                    isSelected
                      ? 'bg-primary/10 border border-primary/30 text-foreground'
                      : 'hover:bg-accent/40 text-foreground border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: role.color }}
                    />
                    <span className="font-medium truncate">{role.name}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {role.is_system ? (
                      <Badge variant="outline" className="text-xs py-0 px-1.5 font-normal">
                        System
                      </Badge>
                    ) : (
                      canManageRoles && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingRole(role);
                          }}
                          className="text-muted-foreground hover:text-destructive p-1 rounded"
                          title="Delete Role"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Role Permissions Matrix */}
        <div className="md:col-span-2 space-y-4">
          {activeRole ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: activeRole.color }}
                  />
                  <div>
                    <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      {activeRole.name} Permissions
                      {isOwnerRole && (
                        <Badge variant="subtle" className="text-xs gap-1">
                          <Lock className="w-2.5 h-2.5" /> All Permissions (Locked)
                        </Badge>
                      )}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Hierarchy position: {activeRole.position}
                    </p>
                  </div>
                </div>

                {isEditable && (
                  <Button
                    size="sm"
                    onClick={handleSavePermissions}
                    disabled={savingPerms || !isDirty}
                    className="text-xs gap-1.5 h-8"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {savingPerms ? 'Saving...' : 'Save Permissions'}
                  </Button>
                )}
              </div>

              {!isEditable && !isOwnerRole && (
                <div className="p-2.5 rounded-lg bg-muted/60 text-muted-foreground text-xs flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    You cannot modify this role because its rank is higher than or equal to your own.
                  </span>
                </div>
              )}

              {/* Grouped Permissions */}
              <div className="space-y-4 max-h-[420px] overflow-y-auto pr-2">
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.title} className="space-y-2">
                    <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.title}
                    </h5>
                    <div className="space-y-1.5">
                      {group.permissions.map((perm) => {
                        const isGranted = isOwnerRole || activePerms.includes(perm.key);
                        return (
                          <div
                            key={perm.key}
                            onClick={() => {
                              if (isEditable) handleTogglePerm(perm.key);
                            }}
                            className={`flex items-start justify-between p-2.5 rounded-lg border transition-colors ${
                              isEditable ? 'cursor-pointer hover:bg-accent/30' : 'cursor-default opacity-90'
                            } ${
                              isGranted
                                ? 'border-primary/20 bg-primary/5'
                                : 'border-border bg-card/20'
                            }`}
                          >
                            <div className="space-y-0.5 pr-4">
                              <span className="text-xs font-medium text-foreground block">
                                {perm.label}
                              </span>
                              <span className="text-xs text-muted-foreground block">
                                {perm.description}
                              </span>
                            </div>

                            <div
                              className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 border transition-colors ${
                                isGranted
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'border-muted-foreground/30 bg-transparent'
                              }`}
                            >
                              {isGranted && <Check className="w-3.5 h-3.5" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Select a role to manage its permissions.
            </div>
          )}
        </div>
      </div>

      {/* Delete Role Dialog */}
      <DeleteRoleDialog
        open={Boolean(deletingRole)}
        onOpenChange={(open) => !open && setDeletingRole(null)}
        role={deletingRole}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
