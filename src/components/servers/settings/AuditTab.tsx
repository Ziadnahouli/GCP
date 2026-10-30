'use client';

import * as React from 'react';
import { FileText, Search, Clock, ShieldAlert, User, Shield } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ModerationAuditLog, Server } from '@/lib/types/server';

interface AuditTabProps {
  server: Server;
  auditLogs: ModerationAuditLog[];
  loading: boolean;
}

export function AuditTab({
  server,
  auditLogs,
  loading,
}: AuditTabProps) {
  const [search, setSearch] = React.useState('');
  const [actionFilter, setActionFilter] = React.useState<string>('all');

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'ban':
      case 'delete_server':
      case 'delete_channel':
      case 'delete_role':
        return <Badge variant="destructive" className="text-[10px] uppercase font-mono">{action}</Badge>;
      case 'kick':
      case 'timeout':
      case 'revoke_invite':
        return <Badge variant="neutral" className="text-[10px] uppercase font-mono text-amber-500 bg-amber-500/10">{action}</Badge>;
      case 'unban':
      case 'untimeout':
        return <Badge variant="neutral" className="text-[10px] uppercase font-mono text-emerald-500 bg-emerald-500/10">{action}</Badge>;
      case 'create_channel':
      case 'create_role':
      case 'create_invite':
        return <Badge variant="outline" className="text-[10px] uppercase font-mono text-primary border-primary/30">{action}</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px] uppercase font-mono">{action}</Badge>;
    }
  };

  const filteredLogs = auditLogs.filter((log) => {
    const matchesAction = actionFilter === 'all' || log.action === actionFilter;
    const actorName = log.actor?.display_name || log.actor?.username || '';
    const targetName = log.target?.display_name || log.target?.username || '';
    const detailsStr = typeof log.details === 'object' ? JSON.stringify(log.details) : '';
    const matchesSearch =
      actorName.toLowerCase().includes(search.toLowerCase()) ||
      targetName.toLowerCase().includes(search.toLowerCase()) ||
      log.action.toLowerCase().includes(search.toLowerCase()) ||
      detailsStr.toLowerCase().includes(search.toLowerCase());

    return matchesAction && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">Audit Log</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Immutable historical record of moderation actions and server configuration changes.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by actor, target, or details..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>

        <div className="w-full sm:w-48">
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Filter Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="kick">Kick</SelectItem>
              <SelectItem value="ban">Ban</SelectItem>
              <SelectItem value="unban">Unban</SelectItem>
              <SelectItem value="timeout">Timeout</SelectItem>
              <SelectItem value="untimeout">Untimeout</SelectItem>
              <SelectItem value="create_channel">Create Channel</SelectItem>
              <SelectItem value="delete_channel">Delete Channel</SelectItem>
              <SelectItem value="create_role">Create Role</SelectItem>
              <SelectItem value="delete_role">Delete Role</SelectItem>
              <SelectItem value="revoke_invite">Revoke Invite</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            Loading audit records...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
            {auditLogs.length === 0
              ? 'No audit log entries recorded yet.'
              : 'No log entries match your filter.'}
          </div>
        ) : (
          <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
            {filteredLogs.map((log) => {
              const actorName = log.actor?.display_name || log.actor?.username || 'System';
              const targetName = log.target?.display_name || log.target?.username || log.target_id;
              const details = log.details as Record<string, unknown> | null;

              return (
                <div
                  key={log.id}
                  className="p-3 rounded-xl border border-border bg-card/40 hover:bg-card/70 transition-colors space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {getActionBadge(log.action)}
                      <span className="text-xs font-semibold text-foreground truncate">
                        {actorName}
                      </span>
                      {targetName && (
                        <>
                          <span className="text-xs text-muted-foreground">→</span>
                          <span className="text-xs font-medium text-foreground truncate">
                            {targetName}
                          </span>
                        </>
                      )}
                    </div>

                    <span className="text-[11px] text-muted-foreground shrink-0 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>

                  {details && Object.keys(details).length > 0 && (
                    <div className="text-[11px] text-muted-foreground bg-muted/30 rounded p-1.5 font-mono overflow-x-auto">
                      {Boolean(details.reason) && <div>Reason: <span className="text-foreground">{String(details.reason)}</span></div>}
                      {details.duration_minutes !== undefined && <div>Duration: <span className="text-foreground">{String(details.duration_minutes)}m</span></div>}
                      {Boolean(details.channel_name) && <div>Channel: <span className="text-foreground">{String(details.channel_name)}</span></div>}
                      {Boolean(details.role_name) && <div>Role: <span className="text-foreground">{String(details.role_name)}</span></div>}
                      {Boolean(details.code) && <div>Invite: <span className="text-foreground">{String(details.code)}</span></div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
