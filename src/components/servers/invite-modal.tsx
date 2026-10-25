'use client';

import * as React from 'react';
import {
  UserPlus,
  Copy,
  Check,
  Search,
  Sparkles,
  Send,
  Users,
  Clock,
  Hash,
} from 'lucide-react';
import { Server } from '@/lib/types/server';
import { useSocial } from '@/hooks/use-social';
import { useServers } from '@/hooks/use-servers';
import { useConversations } from '@/hooks/use-conversations';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-provider';
import { cn } from '@/lib/utils';

interface InviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: Server;
}

const EXPIRY_OPTIONS = [
  { label: '30 minutes', hours: 1 },
  { label: '1 hour', hours: 1 },
  { label: '1 day', hours: 24 },
  { label: '7 days', hours: 168 },
  { label: 'Never', hours: 0 },
];

const MAX_USES_OPTIONS = [
  { label: 'No limit', uses: 0 },
  { label: '1 use', uses: 1 },
  { label: '5 uses', uses: 5 },
  { label: '10 uses', uses: 10 },
  { label: '25 uses', uses: 25 },
  { label: '50 uses', uses: 50 },
  { label: '100 uses', uses: 100 },
];

export function InviteModal({ open, onOpenChange, server }: InviteModalProps) {
  const { user } = useAuth();
  const { friends } = useSocial();
  const { createInvite } = useServers();
  const { getOrCreateDirectConversation } = useConversations();
  const { toast } = useToast();

  const [inviteCode, setInviteCode] = React.useState<string | null>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [copiedLink, setCopiedLink] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [invitedMap, setInvitedMap] = React.useState<Record<string, boolean>>({});
  const [invitingId, setInvitingId] = React.useState<string | null>(null);

  const [expiresInHours, setExpiresInHours] = React.useState<number>(168);
  const [maxUses, setMaxUses] = React.useState<number>(0);

  const generateInvite = React.useCallback(async () => {
    if (!server?.id || !user) return;
    setIsGenerating(true);
    try {
      const res = await createInvite(server.id, maxUses, expiresInHours);
      if (res.invite?.code) {
        setInviteCode(res.invite.code);
      } else if (res.error) {
        toast({
          title: 'Could not create invite',
          description: res.error,
          type: 'error',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to generate server invite.',
        type: 'error',
      });
    } finally {
      setIsGenerating(false);
    }
  }, [server?.id, user, maxUses, expiresInHours, createInvite, toast]);

  React.useEffect(() => {
    if (open && server?.id) {
      generateInvite();
    }
  }, [open, server?.id, generateInvite]);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://nexus.app';
  const fullInviteUrl = inviteCode ? `${origin}/invite/${inviteCode}` : `${origin}/invite/${server.id}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(fullInviteUrl);
    setCopiedLink(true);
    toast({
      title: 'Invite link copied',
      description: 'Share this link with friends to join.',
      type: 'info',
    });
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleDirectInvite = async (friendId: string, friendName: string) => {
    setInvitingId(friendId);
    try {
      const { conversationId, error } = await getOrCreateDirectConversation(friendId);
      if (error || !conversationId) {
        toast({ title: 'Could not send invite', description: error || 'Failed', type: 'error' });
        return;
      }

      const inviteMessage = `Hey ${friendName}! Join my server "${server.name}":\n${fullInviteUrl}`;

      const { getBrowserClient } = await import('@/lib/supabase/client');
      const supabase = getBrowserClient();

      if (supabase && user) {
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          user_id: user.id,
          content: inviteMessage,
        });
      }

      setInvitedMap((prev) => ({ ...prev, [friendId]: true }));
      toast({
        title: 'Invite sent',
        description: `Direct invite sent to ${friendName}.`,
        type: 'success',
      });
    } catch {
      toast({ title: 'Error', description: 'Failed to send invite.', type: 'error' });
    } finally {
      setInvitingId(null);
    }
  };

  const filteredFriends = friends.filter((f) => {
    const term = search.toLowerCase();
    return (
      (f.friend?.display_name || '').toLowerCase().includes(term) ||
      (f.friend?.username || '').toLowerCase().includes(term)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-control bg-primary-subtle text-primary flex items-center justify-center shrink-0">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle>Invite people to {server.name}</DialogTitle>
              <DialogDescription>
                Send an invite link or invite friends directly.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Invite Link Strip */}
        <div className="space-y-1.5 pt-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
            Server invite link
          </label>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={fullInviteUrl}
              className="font-mono text-xs select-all bg-surface-sidebar"
            />
            <Button
              variant={copiedLink ? 'secondary' : 'primary'}
              size="sm"
              onClick={handleCopyLink}
              className="gap-1.5 shrink-0"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-status-online" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Copied' : 'Copy'}</span>
            </Button>
          </div>
        </div>

        {/* Expiration & Max Uses Controls */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div>
            <label htmlFor="invite-expire-select" className="text-xs font-medium text-foreground block mb-1">
              Expire after
            </label>
            <select
              id="invite-expire-select"
              value={expiresInHours}
              onChange={(e) => setExpiresInHours(parseInt(e.target.value, 10))}
              className="w-full px-2.5 py-1.5 rounded-control border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {EXPIRY_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.hours}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="invite-maxuses-select" className="text-xs font-medium text-foreground block mb-1">
              Max uses
            </label>
            <select
              id="invite-maxuses-select"
              value={maxUses}
              onChange={(e) => setMaxUses(parseInt(e.target.value, 10))}
              className="w-full px-2.5 py-1.5 rounded-control border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {MAX_USES_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.uses}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Direct Friends List */}
        <div className="space-y-2 pt-3 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Or invite a friend
            </span>
            <span className="text-xs text-muted-foreground">
              {friends.length} friends
            </span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2.5 pointer-events-none" />
            <Input
              type="text"
              placeholder="Search friends..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs"
            />
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1 pt-1 no-scrollbar">
            {filteredFriends.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                {search ? 'No matching friends found' : 'No friends online to invite'}
              </div>
            ) : (
              filteredFriends.map((f) => {
                const name = f.friend?.display_name || 'Friend';
                const isInvited = Boolean(invitedMap[f.friend.id]);
                const isBusy = invitingId === f.friend.id;

                return (
                  <div
                    key={f.id}
                    className="flex items-center justify-between p-2 rounded-control hover:bg-surface-hover transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar
                        src={f.friend?.avatar_url || null}
                        name={name}
                        size="32"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-foreground truncate">{name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          @{f.friend?.username || 'user'}
                        </div>
                      </div>
                    </div>

                    <Button
                      variant={isInvited ? 'secondary' : 'outline'}
                      size="sm"
                      disabled={isInvited || isBusy}
                      isLoading={isBusy}
                      onClick={() => handleDirectInvite(f.friend.id, name)}
                      className="h-7 text-xs px-2.5 shrink-0"
                    >
                      {isInvited ? 'Invited' : 'Invite'}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
