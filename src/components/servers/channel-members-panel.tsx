'use client';

import * as React from 'react';
import {
  Users,
  MessageSquare,
  Phone,
  Copy,
  Clock,
  Ban,
  Shield,
  Crown,
  MoreVertical,
} from 'lucide-react';
import { Server, hasServerPermission } from '@/lib/types/server';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

export interface ChannelMemberItem {
  id: string;
  display_name: string;
  username: string;
  avatar_url?: string | null;
  role: string;
  role_id?: string | null;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  game_activity?: string | null;
}

interface ChannelMembersPanelProps {
  server: Server;
  currentUserId?: string;
  members: ChannelMemberItem[];
  onStartDirectChat: (userId: string, name: string) => void;
  onStartCall: (userId: string) => void;
  onTimeoutMember: (userId: string, durationSeconds: number, reason: string) => Promise<{ success: boolean; error?: string | null }>;
  onKickMember: (userId: string) => Promise<boolean>;
  onBanMember: (userId: string, reason: string) => Promise<{ success: boolean; error?: string | null }>;
  onBlockUser: (userId: string, name: string) => void;
}

export function ChannelMembersPanel({
  server,
  currentUserId,
  members,
  onStartDirectChat,
  onStartCall,
  onTimeoutMember,
  onKickMember,
  onBanMember,
  onBlockUser,
}: ChannelMembersPanelProps) {
  const { toast } = useToast();

  const currentMember = React.useMemo(() => {
    return (server.members || []).find((m) => m.user_id === currentUserId) || null;
  }, [server.members, currentUserId]);

  const canModerate =
    server.owner_id === currentUserId ||
    currentMember?.role === 'admin' ||
    currentMember?.role === 'moderator' ||
    hasServerPermission(server, currentUserId, 'kick_members');

  // Group members into: Owner, Admins, Online, Offline
  const groupedMembers = React.useMemo(() => {
    const ownerList: ChannelMemberItem[] = [];
    const adminList: ChannelMemberItem[] = [];
    const onlineList: ChannelMemberItem[] = [];
    const offlineList: ChannelMemberItem[] = [];

    members.forEach((m) => {
      const isOwner = m.id === server.owner_id || m.role === 'owner';
      const isAdmin = m.role === 'admin';
      const isOnline = m.status !== 'offline';

      if (isOwner) {
        ownerList.push(m);
      } else if (isAdmin) {
        adminList.push(m);
      } else if (isOnline) {
        onlineList.push(m);
      } else {
        offlineList.push(m);
      }
    });

    return [
      { title: 'Owner', items: ownerList, icon: Crown },
      { title: 'Admins', items: adminList, icon: Shield },
      { title: `Online — ${onlineList.length}`, items: onlineList, icon: null },
      { title: `Offline — ${offlineList.length}`, items: offlineList, icon: null },
    ].filter((g) => g.items.length > 0);
  }, [members, server.owner_id]);

  return (
    <aside className="w-60 border-l border-border bg-surface-sidebar hidden lg:flex flex-col p-3 shrink-0 overflow-y-auto select-none">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-2">
        <Users className="w-3.5 h-3.5 text-primary" />
        <span>Members ({members.length})</span>
      </div>

      <div className="space-y-4">
        {groupedMembers.map((group) => (
          <div key={group.title} className="space-y-0.5">
            <div className="flex items-center gap-1.5 px-1 py-0.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {group.icon && <group.icon className="w-3 h-3 text-warning" />}
              <span>{group.title}</span>
            </div>

            <div className="space-y-0.5">
              {group.items.map((m) => {
                const isMe = m.id === currentUserId;
                const memberRecord = (server.members || []).find((sm) => sm.user_id === m.id);
                const memberRole = memberRecord?.role_id
                  ? (server.roles || []).find((r) => r.id === memberRecord.role_id)
                  : (server.roles || []).find((r) => r.name.toLowerCase() === (m.role || '').toLowerCase());
                const isTimedOut =
                  memberRecord?.timeout_until && new Date(memberRecord.timeout_until) > new Date();

                return (
                  <div
                    key={m.id}
                    onClick={() => !isMe && onStartDirectChat(m.id, m.display_name)}
                    className={cn(
                      'h-8 px-1.5 rounded-control flex items-center justify-between transition-colors group cursor-pointer',
                      isMe
                        ? 'opacity-80 hover:bg-surface-hover cursor-default'
                        : 'hover:bg-surface-hover'
                    )}
                    title={isMe ? 'You' : `Click to message ${m.display_name}`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Avatar
                        src={m.avatar_url || null}
                        name={m.display_name}
                        status={m.status}
                        showStatus
                        size="24"
                      />

                      <div className="min-w-0 flex-1 flex items-center gap-1.5">
                        <span className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">
                          {m.display_name}
                        </span>

                        {memberRole && memberRole.is_custom && (
                          <span
                            className="text-xs px-1.5 py-0 rounded font-medium truncate max-w-[80px]"
                            style={{
                              color: memberRole.color || undefined,
                              backgroundColor: memberRole.color ? `${memberRole.color}20` : undefined,
                              border: memberRole.color ? `1px solid ${memberRole.color}40` : undefined,
                            }}
                            title={memberRole.name}
                          >
                            {memberRole.name}
                          </span>
                        )}

                        {isMe && (
                          <span className="text-xs text-muted-foreground font-normal">(You)</span>
                        )}

                        {isTimedOut && (
                          <Badge variant="warning" className="text-xs px-1 py-0">
                            Timed out
                          </Badge>
                        )}
                      </div>
                    </div>

                    {!isMe && (
                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              className="p-1 rounded-control text-muted-foreground hover:text-foreground hover:bg-surface-active transition-colors"
                              aria-label={`Options for ${m.display_name}`}
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                          </DropdownMenuTrigger>

                          <DropdownMenuContent align="end" className="w-48 p-1">
                            <div className="px-2 py-1 text-xs text-muted-foreground border-b border-border mb-1 truncate">
                              <span className="font-medium text-foreground">{m.display_name}</span>
                              <span className="ml-1 text-muted-foreground">@{m.username}</span>
                            </div>

                            <DropdownMenuItem
                              onClick={() => onStartDirectChat(m.id, m.display_name)}
                              className="flex items-center gap-2 text-xs cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-primary" />
                              <span>Send message</span>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => onStartCall(m.id)}
                              className="flex items-center gap-2 text-xs cursor-pointer"
                            >
                              <Phone className="w-3.5 h-3.5 text-status-online" />
                              <span>Start call</span>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => {
                                navigator.clipboard.writeText(m.id);
                                toast({ title: 'Copied', description: 'User ID copied to clipboard.', type: 'info' });
                              }}
                              className="flex items-center gap-2 text-xs cursor-pointer text-muted-foreground"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy ID</span>
                            </DropdownMenuItem>

                            {canModerate && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={async () => {
                                    const res = await onTimeoutMember(m.id, 60, '60-second timeout');
                                    if (res.success) {
                                      toast({ title: 'Timed out', description: `${m.display_name} timed out for 60 seconds.`, type: 'info' });
                                    } else {
                                      toast({ title: 'Timeout failed', description: res.error || 'Failed', type: 'error' });
                                    }
                                  }}
                                  className="flex items-center gap-2 text-xs text-warning cursor-pointer"
                                >
                                  <Clock className="w-3.5 h-3.5" />
                                  <span>Timeout (60s)</span>
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                  onClick={async () => {
                                    const mins = prompt('Enter timeout duration in minutes (0 to remove):', '60');
                                    if (mins === null) return;
                                    const numMins = parseInt(mins, 10);
                                    if (isNaN(numMins)) return;
                                    const seconds = numMins * 60;
                                    const reason = prompt('Reason for timeout:', 'Violation of server rules') || 'Moderator timeout';
                                    const res = await onTimeoutMember(m.id, seconds, reason);
                                    if (res.success) {
                                      toast({
                                        title: seconds > 0 ? 'Member timed out' : 'Timeout removed',
                                        description: seconds > 0 ? `Timed out for ${numMins} minutes.` : 'Member can now chat.',
                                        type: 'info',
                                      });
                                    } else {
                                      toast({ title: 'Timeout failed', description: res.error || 'Failed', type: 'error' });
                                    }
                                  }}
                                  className="flex items-center gap-2 text-xs text-warning cursor-pointer"
                                >
                                  <Clock className="w-3.5 h-3.5" />
                                  <span>Timeout...</span>
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                  onClick={async () => {
                                    if (confirm(`Are you sure you want to kick ${m.display_name}?`)) {
                                      const ok = await onKickMember(m.id);
                                      if (ok) {
                                        toast({ title: 'Member kicked', description: `${m.display_name} was removed from the server.`, type: 'info' });
                                      } else {
                                        toast({ title: 'Kick failed', description: 'Failed to kick member.', type: 'error' });
                                      }
                                    }
                                  }}
                                  className="flex items-center gap-2 text-xs text-danger cursor-pointer"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                  <span>Kick member</span>
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                  onClick={async () => {
                                    const reason = prompt(`Reason for banning ${m.display_name}:`, 'Violating rules');
                                    if (reason === null) return;
                                    const res = await onBanMember(m.id, reason);
                                    if (res.success) {
                                      toast({ title: 'Member banned', description: `${m.display_name} was banned.`, type: 'info' });
                                    } else {
                                      toast({ title: 'Ban failed', description: res.error || 'Failed', type: 'error' });
                                    }
                                  }}
                                  className="flex items-center gap-2 text-xs text-danger cursor-pointer"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                  <span>Ban member</span>
                                </DropdownMenuItem>
                              </>
                            )}

                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => onBlockUser(m.id, m.display_name)}
                              className="flex items-center gap-2 text-xs text-danger cursor-pointer"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span>Block user</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
