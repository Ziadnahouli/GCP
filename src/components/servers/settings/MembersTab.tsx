'use client';

import * as React from 'react';
import {
  Search,
  Shield,
  Crown,
  Clock,
  UserMinus,
  Ban,
  ShieldAlert,
  XCircle,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Server, ServerMember, ServerRole } from '@/lib/types/server';
import { TimeoutMemberDialog } from './TimeoutMemberDialog';
import { BanMemberDialog } from './BanMemberDialog';
import { KickMemberDialog } from './KickMemberDialog';
import { ToastItem } from '@/components/ui/toast';

interface MembersTabProps {
  server: Server;
  currentUserId?: string;
  canKick: boolean;
  canBan: boolean;
  canTimeout: boolean;
  canManageRoles: boolean;
  userHighestRoleRank: number;
  toast: (options: Omit<ToastItem, 'id'>) => void;
  onUpdateMemberRole?: (serverId: string, userId: string, newRole: ServerRole) => Promise<unknown>;
  onKickMember?: (serverId: string, userId: string) => Promise<unknown>;
  onBanMember?: (serverId: string, userId: string, reason?: string) => Promise<unknown>;
  onTimeoutMember?: (serverId: string, userId: string, durationMinutes: number, reason?: string) => Promise<unknown>;
}

export function MembersTab({
  server,
  currentUserId,
  canKick,
  canBan,
  canTimeout,
  canManageRoles,
  userHighestRoleRank,
  toast,
  onUpdateMemberRole,
  onKickMember,
  onBanMember,
  onTimeoutMember,
}: MembersTabProps) {
  const [search, setSearch] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState<string>('all');

  // Dialog states
  const [timingOutMember, setTimingOutMember] = React.useState<ServerMember | null>(null);
  const [banningMember, setBanningMember] = React.useState<ServerMember | null>(null);
  const [kickingMember, setKickingMember] = React.useState<ServerMember | null>(null);

  const members = server.members || [];
  const roles = server.roles || [];

  // Helper to determine rank of a member
  const getMemberRank = (member: ServerMember): number => {
    if (member.user_id === server.owner_id) return 9999;
    if (member.role_id) {
      const r = roles.find((role) => role.id === member.role_id);
      if (r) return r.position ?? 0;
    }
    if (member.role === 'admin') return 100;
    if (member.role === 'moderator') return 50;
    return 10;
  };

  const filteredMembers = members.filter((member) => {
    const name = member.profile?.display_name || member.profile?.username || '';
    const matchesSearch = name.toLowerCase().includes(search.toLowerCase());
    const matchesRole =
      roleFilter === 'all' ||
      member.role === roleFilter ||
      member.role_id === roleFilter;
    return matchesSearch && matchesRole;
  });

  const formatRemainingTimeout = (timeoutUntil: string | null | undefined): string | null => {
    if (!timeoutUntil) return null;
    const diff = new Date(timeoutUntil).getTime() - Date.now();
    if (diff <= 0) return null;

    const mins = Math.ceil(diff / 60000);
    if (mins < 60) return `${mins}m left`;
    const hours = Math.ceil(mins / 60);
    if (hours < 24) return `${hours}h left`;
    const days = Math.ceil(hours / 24);
    return `${days}d left`;
  };

  const handleRoleChange = async (member: ServerMember, newRoleValue: string) => {
    const targetRank = getMemberRank(member);
    if (targetRank >= userHighestRoleRank && userHighestRoleRank < 9999) {
      toast({
        title: 'Action Not Permitted',
        description: 'You cannot change the role of a peer or higher-ranked member.',
        type: 'error',
      });
      return;
    }

    try {
      if (onUpdateMemberRole) {
        await onUpdateMemberRole(server.id, member.user_id, newRoleValue as ServerRole);
      }
      toast({
        title: 'Role Updated',
        description: `Updated role for ${member.profile?.display_name || 'member'}.`,
        type: 'success',
      });
    } catch (err: unknown) {
      toast({
        title: 'Role Update Failed',
        description: (err as Error)?.message || 'Failed to update member role.',
        type: 'error',
      });
    }
  };

  const handleTimeoutConfirm = async (durationMinutes: number, reason: string) => {
    if (!timingOutMember) return;
    try {
      if (onTimeoutMember) {
        await onTimeoutMember(server.id, timingOutMember.user_id, durationMinutes, reason);
      }
      toast({
        title: durationMinutes > 0 ? 'Member Timed Out' : 'Timeout Removed',
        description:
          durationMinutes > 0
            ? `Timed out ${timingOutMember.profile?.display_name || 'member'} for ${durationMinutes} minutes.`
            : `Removed timeout for ${timingOutMember.profile?.display_name || 'member'}.`,
        type: 'success',
      });
    } catch (err: unknown) {
      toast({
        title: 'Timeout Failed',
        description: (err as Error)?.message || 'Failed to execute timeout.',
        type: 'error',
      });
    }
  };

  const handleBanConfirm = async (reason: string) => {
    if (!banningMember) return;
    try {
      if (onBanMember) {
        await onBanMember(server.id, banningMember.user_id, reason);
      }
      toast({
        title: 'Member Banned',
        description: `Banned ${banningMember.profile?.display_name || 'member'} from the server.`,
        type: 'success',
      });
    } catch (err: unknown) {
      toast({
        title: 'Ban Failed',
        description: (err as Error)?.message || 'Failed to ban member.',
        type: 'error',
      });
    }
  };

  const handleKickConfirm = async (reason: string) => {
    if (!kickingMember) return;
    try {
      if (onKickMember) {
        await onKickMember(server.id, kickingMember.user_id);
      }
      toast({
        title: 'Member Kicked',
        description: `Removed ${kickingMember.profile?.display_name || 'member'} from the server.`,
        type: 'success',
      });
    } catch (err: unknown) {
      toast({
        title: 'Kick Failed',
        description: (err as Error)?.message || 'Failed to kick member.',
        type: 'error',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">Server Members</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage member permissions, roles, and moderation statuses.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by display name or username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>

        <div className="w-full sm:w-48">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Filter by Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles ({members.length})</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="moderator">Moderator</SelectItem>
              <SelectItem value="member">Member</SelectItem>
              {roles
                .filter((r) => r.is_custom)
                .map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Members List */}
      <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
        {filteredMembers.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
            No members matching your search criteria.
          </div>
        ) : (
          filteredMembers.map((member) => {
            const isOwner = member.user_id === server.owner_id;
            const isCurrentUser = member.user_id === currentUserId;
            const targetRank = getMemberRank(member);
            const canModerateTarget =
              !isOwner &&
              !isCurrentUser &&
              (userHighestRoleRank > targetRank || userHighestRoleRank >= 9999);

            const remainingTimeout = formatRemainingTimeout(member.timeout_until);
            const displayName =
              member.profile?.display_name || member.profile?.username || 'Member';

            // Find current role definition
            const currentRoleDef = member.role_id
              ? roles.find((r) => r.id === member.role_id)
              : roles.find((r) => r.name.toLowerCase() === (member.role || 'member').toLowerCase());

            return (
              <div
                key={member.user_id}
                className="flex items-center justify-between p-3 rounded-xl border border-border bg-card/40 hover:bg-card/70 transition-colors gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar src={member.profile?.avatar_url} name={displayName} size={32} />

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground truncate">
                        {displayName}
                      </span>
                      {isOwner && (
                        <span title="Server Owner">
                          <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        </span>
                      )}
                      {remainingTimeout && (
                        <Badge variant="destructive" className="text-[10px] py-0 px-1.5 gap-1">
                          <Clock className="w-2.5 h-2.5" /> {remainingTimeout}
                        </Badge>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground truncate block">
                      @{member.profile?.username || 'user'}
                    </span>
                  </div>
                </div>

                {/* Right controls: Role Selector & Moderation Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Role Selector */}
                  {canManageRoles && !isOwner && canModerateTarget ? (
                    <Select
                      value={member.role_id || member.role || 'member'}
                      onValueChange={(val) => handleRoleChange(member, val)}
                    >
                      <SelectTrigger className="h-7 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roles
                          .filter((r) => (r.position ?? 0) < userHighestRoleRank || userHighestRoleRank >= 9999)
                          .map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: r.color }}
                                />
                                {r.name}
                              </div>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-xs py-0.5 px-2 gap-1.5"
                      style={{
                        borderColor: currentRoleDef?.color
                          ? `${currentRoleDef.color}50`
                          : undefined,
                      }}
                    >
                      {currentRoleDef && (
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: currentRoleDef.color }}
                        />
                      )}
                      {isOwner ? 'Owner' : currentRoleDef?.name || member.role || 'Member'}
                    </Badge>
                  )}

                  {/* Moderation Buttons */}
                  {canModerateTarget && (
                    <div className="flex items-center gap-1">
                      {canTimeout && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setTimingOutMember(member)}
                          className="h-7 w-7 text-muted-foreground hover:text-amber-500"
                          title="Timeout Member"
                        >
                          <Clock className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {canKick && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setKickingMember(member)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title="Kick Member"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {canBan && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setBanningMember(member)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title="Ban Member"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Moderation Radix Dialogs */}
      <TimeoutMemberDialog
        open={Boolean(timingOutMember)}
        onOpenChange={(open) => !open && setTimingOutMember(null)}
        member={timingOutMember}
        onConfirm={handleTimeoutConfirm}
      />

      <BanMemberDialog
        open={Boolean(banningMember)}
        onOpenChange={(open) => !open && setBanningMember(null)}
        member={banningMember}
        onConfirm={handleBanConfirm}
      />

      <KickMemberDialog
        open={Boolean(kickingMember)}
        onOpenChange={(open) => !open && setKickingMember(null)}
        member={kickingMember}
        onConfirm={handleKickConfirm}
      />
    </div>
  );
}
