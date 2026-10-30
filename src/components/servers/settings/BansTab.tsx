'use client';

import * as React from 'react';
import { Ban, Search, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { Server, ServerBan } from '@/lib/types/server';
import { UnbanMemberDialog } from './UnbanMemberDialog';
import { ToastItem } from '@/components/ui/toast';

interface BansTabProps {
  server: Server;
  bans: ServerBan[];
  loading: boolean;
  canBan: boolean;
  toast: (options: Omit<ToastItem, 'id'>) => void;
  onUnbanMember: (serverId: string, userId: string) => Promise<unknown>;
}

export function BansTab({
  server,
  bans,
  loading,
  canBan,
  toast,
  onUnbanMember,
}: BansTabProps) {
  const [search, setSearch] = React.useState('');
  const [unbanningBan, setUnbanningBan] = React.useState<ServerBan | null>(null);

  const filteredBans = bans.filter((ban) => {
    const name = ban.profile?.display_name || ban.profile?.username || '';
    const reason = ban.reason || '';
    return (
      name.toLowerCase().includes(search.toLowerCase()) ||
      reason.toLowerCase().includes(search.toLowerCase())
    );
  });

  const handleUnbanConfirm = async () => {
    if (!unbanningBan) return;
    try {
      await onUnbanMember(server.id, unbanningBan.user_id);
      toast({
        title: 'User Unbanned',
        description: `Lifted ban for ${unbanningBan.profile?.display_name || 'user'}.`,
        type: 'success',
      });
    } catch (err: unknown) {
      toast({
        title: 'Unban Failed',
        description: (err as Error)?.message || 'Failed to unban user.',
        type: 'error',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">Banned Users</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          View users who are permanently banned from joining this server.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search bans by username or reason..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 text-xs"
        />
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            Loading bans list...
          </div>
        ) : filteredBans.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
            {bans.length === 0
              ? 'No users are currently banned from this server.'
              : 'No bans match your search query.'}
          </div>
        ) : (
          <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
            {filteredBans.map((ban) => {
              const displayName =
                ban.profile?.display_name || ban.profile?.username || 'Banned User';

              return (
                <div
                  key={ban.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-border bg-card/40 hover:bg-card/70 transition-colors gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar src={ban.profile?.avatar_url} name={displayName} size={32} />

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground truncate">
                          {displayName}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          banned {new Date(ban.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground truncate block">
                        Reason: {ban.reason || 'No reason provided'}
                      </span>
                    </div>
                  </div>

                  {canBan && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setUnbanningBan(ban)}
                      className="text-xs h-8 gap-1.5 shrink-0"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Unban
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Unban Radix Dialog */}
      <UnbanMemberDialog
        open={Boolean(unbanningBan)}
        onOpenChange={(open) => !open && setUnbanningBan(null)}
        ban={unbanningBan}
        onConfirm={handleUnbanConfirm}
      />
    </div>
  );
}
