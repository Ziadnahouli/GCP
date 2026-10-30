'use client';

import * as React from 'react';
import {
  Settings,
  Shield,
  Hash,
  Users,
  Link2,
  Ban,
  FileText,
  Flag,
  AlertTriangle,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Server,
  ChannelType,
  ServerRole,
  RoleDefinition,
  ServerPermission,
  ServerBan,
  ModerationAuditLog,
  ServerInvite,
} from '@/lib/types/server';
import { useAuth } from '@/features/auth/auth-provider';
import { useServers, usePermissions } from '@/hooks/use-servers';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

// Subcomponents
import { OverviewTab } from './settings/OverviewTab';
import { ChannelsTab } from './settings/ChannelsTab';
import { RolesTab } from './settings/RolesTab';
import { MembersTab } from './settings/MembersTab';
import { InvitesTab } from './settings/InvitesTab';
import { BansTab } from './settings/BansTab';
import { AuditTab } from './settings/AuditTab';
import { ReportsTab } from './settings/ReportsTab';
import { DangerTab } from './settings/DangerTab';

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
  onTransferOwnership?: (serverId: string, newOwnerId: string) => Promise<boolean | unknown>;
  onCreateRole?: (serverId: string, name: string, color: string, permissions: ServerPermission[]) => Promise<unknown>;
  onUpdateRole?: (serverId: string, roleId: string, updates: Partial<RoleDefinition>) => Promise<unknown>;
  onDeleteRole?: (serverId: string, roleId: string) => Promise<unknown>;
  onUpdateRolePermissions?: (serverId: string, roleIdOrName: string, permissions: ServerPermission[]) => Promise<unknown>;
}

type TabKey =
  | 'overview'
  | 'channels'
  | 'roles'
  | 'members'
  | 'invites'
  | 'bans'
  | 'audit'
  | 'reports'
  | 'danger';

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
  onTransferOwnership,
  onCreateRole,
  onUpdateRole,
  onDeleteRole,
  onUpdateRolePermissions,
}: ServerSettingsModalProps) {
  const { user } = useAuth();
  const {
    banMember,
    unbanMember,
    timeoutMember,
    createInvite,
    revokeInvite,
    fetchAuditLogs,
    fetchBans,
    fetchInvites,
    fetchServerReports,
    resolveReport,
    dismissReport,
  } = useServers();
  const { toast } = useToast();
  const permissions = usePermissions(server.id);

  // SS-S1 & SS-R4: Strict server ownership check (never fallback to true if owner_id is missing)
  const isOwner = Boolean(user?.id && server.owner_id && server.owner_id === user.id);

  // Active tab state
  const [activeTab, setActiveTab] = React.useState<TabKey>('overview');
  const [isOverviewDirty, setIsOverviewDirty] = React.useState(false);

  // Async data states
  const [auditLogs, setAuditLogs] = React.useState<ModerationAuditLog[]>([]);
  const [bansList, setBansList] = React.useState<ServerBan[]>([]);
  const [invitesList, setInvitesList] = React.useState<ServerInvite[]>([]);
  const [reportsList, setReportsList] = React.useState<any[]>([]);
  const [loadingData, setLoadingData] = React.useState(false);

  // Calculate highest rank for the current user
  const userHighestRoleRank = React.useMemo(() => {
    if (isOwner) return 9999;
    const currentMember = server.members?.find((m) => m.user_id === user?.id);
    if (!currentMember) return 0;
    if (currentMember.role_id) {
      const r = server.roles?.find((role) => role.id === currentMember.role_id);
      if (r) return r.position ?? 0;
    }
    if (currentMember.role === 'admin') return 100;
    if (currentMember.role === 'moderator') return 50;
    return 10;
  }, [isOwner, server.members, server.roles, user?.id]);

  // Load tab-specific async data
  React.useEffect(() => {
    if (!open) return;

    if (activeTab === 'audit' && (isOwner || permissions.can('view_audit_log'))) {
      setLoadingData(true);
      fetchAuditLogs(server.id)
        .then(setAuditLogs)
        .catch(() => {})
        .finally(() => setLoadingData(false));
    } else if (activeTab === 'bans' && (isOwner || permissions.can('ban_members'))) {
      setLoadingData(true);
      fetchBans(server.id)
        .then(setBansList)
        .catch(() => {})
        .finally(() => setLoadingData(false));
    } else if (activeTab === 'invites' && (isOwner || permissions.can('manage_invites') || permissions.can('create_invites'))) {
      setLoadingData(true);
      fetchInvites(server.id)
        .then(setInvitesList)
        .catch(() => {})
        .finally(() => setLoadingData(false));
    } else if (activeTab === 'reports' && (isOwner || permissions.can('manage_reports'))) {
      setLoadingData(true);
      fetchServerReports(server.id)
        .then(setReportsList)
        .catch(() => {})
        .finally(() => setLoadingData(false));
    }
  }, [
    activeTab,
    open,
    server.id,
    isOwner,
    permissions,
    fetchAuditLogs,
    fetchBans,
    fetchInvites,
    fetchServerReports,
  ]);

  // Navigation Items
  const navItems: { key: TabKey; label: string; icon: React.ReactNode; visible: boolean; badge?: number }[] = [
    {
      key: 'overview',
      label: 'Overview',
      icon: <Settings className="w-4 h-4" />,
      visible: true,
    },
    {
      key: 'channels',
      label: 'Channels',
      icon: <Hash className="w-4 h-4" />,
      visible: isOwner || permissions.can('manage_channels'),
    },
    {
      key: 'roles',
      label: 'Roles & Perms',
      icon: <Shield className="w-4 h-4" />,
      visible: isOwner || permissions.can('manage_roles'),
    },
    {
      key: 'members',
      label: 'Members',
      icon: <Users className="w-4 h-4" />,
      visible: true,
      badge: server.members?.length,
    },
    {
      key: 'invites',
      label: 'Invites',
      icon: <Link2 className="w-4 h-4" />,
      visible: isOwner || permissions.can('create_invites') || permissions.can('manage_invites'),
    },
    {
      key: 'bans',
      label: 'Bans',
      icon: <Ban className="w-4 h-4" />,
      visible: isOwner || permissions.can('ban_members'),
    },
    {
      key: 'audit',
      label: 'Audit Log',
      icon: <FileText className="w-4 h-4" />,
      visible: isOwner || permissions.can('view_audit_log'),
    },
    {
      key: 'reports',
      label: 'Reports',
      icon: <Flag className="w-4 h-4" />,
      visible: isOwner || permissions.can('manage_reports'),
    },
    {
      key: 'danger',
      label: 'Danger Zone',
      icon: <AlertTriangle className="w-4 h-4 text-destructive" />,
      visible: true,
    },
  ];

  const handleTabChange = (key: TabKey) => {
    setActiveTab(key);
  };

  const handleBanConfirm = async (serverId: string, userId: string, reason?: string) => {
    return banMember(serverId, userId, reason);
  };

  const handleTimeoutConfirm = async (
    serverId: string,
    userId: string,
    durationMinutes: number,
    reason?: string
  ) => {
    return timeoutMember(serverId, userId, durationMinutes, reason);
  };

  const handleCreateInviteSubmit = async (
    serverId: string,
    maxUses: number,
    expiresHours: number
  ) => {
    const res = await createInvite(serverId, maxUses, expiresHours);
    const newInv = res?.invite;
    if (newInv) {
      setInvitesList((prev) => [newInv, ...prev]);
    }
  };

  const handleRevokeInviteSubmit = async (inviteId: string) => {
    await revokeInvite(inviteId);
    setInvitesList((prev) =>
      prev.map((i) => (i.id === inviteId ? { ...i, is_revoked: true } : i))
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-full sm:max-w-4xl h-[90dvh] sm:h-[700px] sm:max-h-[88vh] p-0 overflow-hidden flex flex-col md:flex-row gap-0"
        showClose={false}
      >
        <DialogTitle className="sr-only">Server Settings - {server.name}</DialogTitle>
        <DialogDescription className="sr-only">
          Configure server settings, manage channels, members, roles, and moderation permissions.
        </DialogDescription>

        {/* Sidebar Navigation */}
        <aside className="w-full md:w-56 bg-surface-sidebar border-b md:border-b-0 md:border-r border-border p-3 md:p-4 flex flex-row md:flex-col justify-between shrink-0 overflow-x-auto no-scrollbar">
          <div className="space-y-1 w-full flex flex-row md:flex-col gap-1 md:gap-0">
            <div className="hidden md:flex items-center gap-2 px-2 py-1.5 mb-2">
              <Settings className="w-4 h-4 text-primary" />
              <span className="font-semibold text-xs tracking-wider uppercase text-muted-foreground truncate">
                {server.name}
              </span>
            </div>

            {navItems
              .filter((item) => item.visible)
              .map((item) => {
                const isActive = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleTabChange(item.key)}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap w-full text-left',
                      isActive
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-muted-foreground hover:bg-card/50 hover:text-foreground'
                    )}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    <span className="truncate flex-1">{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                        {item.badge}
                      </Badge>
                    )}
                  </button>
                );
              })}
          </div>

          {/* Close button for desktop sidebar */}
          <div className="hidden md:flex flex-col gap-1 border-t border-border pt-3 mt-auto">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs text-muted-foreground hover:text-foreground justify-start gap-2 h-8"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close Settings</span>
            </Button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden relative">
          {/* Header on mobile */}
          <div className="flex md:hidden items-center justify-between p-3 border-b border-border bg-card/20">
            <span className="text-xs font-semibold truncate">{server.name}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-7 w-7 text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {activeTab === 'overview' && (
              <OverviewTab
                server={server}
                onUpdateServer={onUpdateServer}
                canManageServer={isOwner || permissions.can('manage_server')}
                toast={toast}
                isDirty={isOverviewDirty}
                setIsDirty={setIsOverviewDirty}
              />
            )}

            {activeTab === 'channels' && (
              <ChannelsTab
                server={server}
                canManageChannels={isOwner || permissions.can('manage_channels')}
                toast={toast}
                onCreateChannel={onCreateChannel}
                onUpdateChannel={onUpdateChannel}
                onDeleteChannel={onDeleteChannel}
              />
            )}

            {activeTab === 'roles' && (
              <RolesTab
                server={server}
                canManageRoles={isOwner || permissions.can('manage_roles')}
                userHighestRoleRank={userHighestRoleRank}
                toast={toast}
                onCreateRole={onCreateRole}
                onUpdateRole={onUpdateRole}
                onDeleteRole={onDeleteRole}
                onUpdateRolePermissions={onUpdateRolePermissions}
              />
            )}

            {activeTab === 'members' && (
              <MembersTab
                server={server}
                currentUserId={user?.id}
                canKick={isOwner || permissions.can('kick_members')}
                canBan={isOwner || permissions.can('ban_members')}
                canTimeout={isOwner || permissions.can('moderate_members')}
                canManageRoles={isOwner || permissions.can('manage_roles')}
                userHighestRoleRank={userHighestRoleRank}
                toast={toast}
                onUpdateMemberRole={onUpdateMemberRole}
                onKickMember={onKickMember}
                onBanMember={handleBanConfirm}
                onTimeoutMember={handleTimeoutConfirm}
              />
            )}

            {activeTab === 'invites' && (
              <InvitesTab
                server={server}
                invites={invitesList}
                loading={loadingData}
                canCreateInvites={isOwner || permissions.can('create_invites')}
                canManageInvites={isOwner || permissions.can('manage_invites')}
                toast={toast}
                onCreateInvite={handleCreateInviteSubmit}
                onRevokeInvite={handleRevokeInviteSubmit}
              />
            )}

            {activeTab === 'bans' && (
              <BansTab
                server={server}
                bans={bansList}
                loading={loadingData}
                canBan={isOwner || permissions.can('ban_members')}
                toast={toast}
                onUnbanMember={unbanMember}
              />
            )}

            {activeTab === 'audit' && (
              <AuditTab
                server={server}
                auditLogs={auditLogs}
                loading={loadingData}
              />
            )}

            {activeTab === 'reports' && (
              <ReportsTab
                server={server}
                reports={reportsList}
                loading={loadingData}
                canManageReports={isOwner || permissions.can('manage_reports')}
                toast={toast}
                onResolveReport={resolveReport}
                onDismissReport={dismissReport}
              />
            )}

            {activeTab === 'danger' && (
              <DangerTab
                server={server}
                isOwner={isOwner}
                currentUserId={user?.id}
                toast={toast}
                onDeleteServer={onDeleteServer}
                onTransferOwnership={onTransferOwnership}
                onLeaveServer={onLeaveServer}
                onCloseModal={() => onOpenChange(false)}
              />
            )}
          </div>
        </main>
      </DialogContent>
    </Dialog>
  );
}
