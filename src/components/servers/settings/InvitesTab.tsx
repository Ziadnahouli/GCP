'use client';

import * as React from 'react';
import {
  Link2,
  Plus,
  Copy,
  Check,
  Trash2,
  Clock,
  Users,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Server, ServerInvite } from '@/lib/types/server';
import { RevokeInviteDialog } from './RevokeInviteDialog';
import { ToastItem } from '@/components/ui/toast';

interface InvitesTabProps {
  server: Server;
  invites: ServerInvite[];
  loading: boolean;
  canCreateInvites: boolean;
  canManageInvites: boolean;
  toast: (options: Omit<ToastItem, 'id'>) => void;
  onCreateInvite: (serverId: string, maxUses: number, expiresHours: number) => Promise<unknown>;
  onRevokeInvite: (inviteId: string) => Promise<unknown>;
}

export function InvitesTab({
  server,
  invites,
  loading,
  canCreateInvites,
  canManageInvites,
  toast,
  onCreateInvite,
  onRevokeInvite,
}: InvitesTabProps) {
  const [maxUses, setMaxUses] = React.useState<number>(0);
  const [expiresHours, setExpiresHours] = React.useState<number>(24);
  const [creating, setCreating] = React.useState(false);
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null);
  const [revokingInvite, setRevokingInvite] = React.useState<ServerInvite | null>(null);

  const getInviteLink = (code: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/invite/${code}`;
  };

  const copyToClipboard = async (code: string) => {
    const link = getInviteLink(code);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = link;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
      toast({
        title: 'Copied to Clipboard',
        description: 'Server invite link copied.',
        type: 'success',
      });
    } catch {
      toast({
        title: 'Copy Failed',
        description: 'Could not copy link to clipboard.',
        type: 'error',
      });
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await onCreateInvite(server.id, maxUses, expiresHours);
      toast({
        title: 'Invite Created',
        description: 'New server invite link has been generated.',
        type: 'success',
      });
    } catch (err: unknown) {
      toast({
        title: 'Invite Generation Failed',
        description: (err as Error)?.message || 'Failed to generate invite.',
        type: 'error',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeConfirm = async () => {
    if (!revokingInvite) return;
    try {
      await onRevokeInvite(revokingInvite.id);
      toast({
        title: 'Invite Revoked',
        description: `Invite code ${revokingInvite.code} has been revoked.`,
        type: 'success',
      });
    } catch (err: unknown) {
      toast({
        title: 'Revoke Failed',
        description: (err as Error)?.message || 'Failed to revoke invite.',
        type: 'error',
      });
    }
  };

  const getInviteStatus = (inv: ServerInvite) => {
    if (inv.is_revoked) {
      return <Badge variant="destructive" className="text-[10px]">Revoked</Badge>;
    }
    if (inv.max_uses > 0 && inv.uses >= inv.max_uses) {
      return <Badge variant="neutral" className="text-[10px]">Used Up</Badge>;
    }
    if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) {
      return <Badge variant="outline" className="text-[10px] text-muted-foreground">Expired</Badge>;
    }
    return <Badge variant="default" className="text-[10px] bg-emerald-600 hover:bg-emerald-600">Active</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">Invites</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Generate links to invite friends and manage active invitations.
        </p>
      </div>

      {/* Invite Generation Section */}
      {canCreateInvites && (
        <form
          onSubmit={handleCreateSubmit}
          className="p-4 rounded-xl border border-border bg-card/60 space-y-4"
        >
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Create an Invite Link
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Expire After</label>
              <Select
                value={String(expiresHours)}
                onValueChange={(val) => setExpiresHours(Number(val))}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Hour</SelectItem>
                  <SelectItem value="6">6 Hours</SelectItem>
                  <SelectItem value="12">12 Hours</SelectItem>
                  <SelectItem value="24">1 Day (Default)</SelectItem>
                  <SelectItem value="168">7 Days</SelectItem>
                  <SelectItem value="0">Never</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Max Number of Uses</label>
              <Select
                value={String(maxUses)}
                onValueChange={(val) => setMaxUses(Number(val))}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">No Limit</SelectItem>
                  <SelectItem value="1">1 Use</SelectItem>
                  <SelectItem value="5">5 Uses</SelectItem>
                  <SelectItem value="10">10 Uses</SelectItem>
                  <SelectItem value="25">25 Uses</SelectItem>
                  <SelectItem value="50">50 Uses</SelectItem>
                  <SelectItem value="100">100 Uses</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <Button
              type="submit"
              size="sm"
              disabled={creating}
              className="text-xs gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {creating ? 'Generating...' : 'Generate New Link'}
            </Button>
          </div>
        </form>
      )}

      {/* Invites List */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
          Active & Past Invites ({invites.length})
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            Loading invites...
          </div>
        ) : invites.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
            No invites have been created for this server yet.
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {invites.map((inv) => {
              const fullLink = getInviteLink(inv.code);
              const isCopied = copiedCode === inv.code;

              return (
                <div
                  key={inv.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 rounded-xl border border-border bg-card/40 hover:bg-card/70 transition-colors gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-semibold font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                        {inv.code}
                      </code>
                      {getInviteStatus(inv)}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {inv.uses} {inv.max_uses > 0 ? `/ ${inv.max_uses}` : ''} uses
                      </span>
                      {inv.expires_at ? (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Expires {new Date(inv.expires_at).toLocaleDateString()}
                        </span>
                      ) : (
                        <span>Never expires</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => copyToClipboard(inv.code)}
                      className="text-xs h-7 gap-1.5"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Link</span>
                        </>
                      )}
                    </Button>

                    {canManageInvites && !inv.is_revoked && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setRevokingInvite(inv)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="Revoke Invite"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Revoke Invite Radix Dialog */}
      <RevokeInviteDialog
        open={Boolean(revokingInvite)}
        onOpenChange={(open) => !open && setRevokingInvite(null)}
        invite={revokingInvite}
        onConfirm={handleRevokeConfirm}
      />
    </div>
  );
}
