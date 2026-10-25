'use client';

import * as React from 'react';
import {
  UserPlus,
  Copy,
  Check,
  Search,
  Sparkles,
  X,
  Send,
  Users,
  Clock,
  Hash,
  Loader2,
} from 'lucide-react';
import { Server } from '@/lib/types/server';
import { useSocial } from '@/hooks/use-social';
import { useServers } from '@/hooks/use-servers';
import { useConversations } from '@/hooks/use-conversations';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { getBrowserClient } from '@/lib/supabase/client';
import { useAuth } from '@/features/auth/auth-provider';
import { useModalEscape } from '@/hooks/use-modal-escape';

interface InviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: Server;
}

const EXPIRY_OPTIONS = [
  { label: '30 Minutes', hours: 1 },
  { label: '1 Hour', hours: 1 },
  { label: '1 Day', hours: 24 },
  { label: '7 Days', hours: 168 },
  { label: 'Never', hours: 0 },
];

const MAX_USES_OPTIONS = [
  { label: 'No Limit', uses: 0 },
  { label: '1 Use', uses: 1 },
  { label: '5 Uses', uses: 5 },
  { label: '10 Uses', uses: 10 },
  { label: '25 Uses', uses: 25 },
  { label: '50 Uses', uses: 50 },
  { label: '100 Uses', uses: 100 },
];

export function InviteModal({ open, onOpenChange, server }: InviteModalProps) {
  useModalEscape(open, onOpenChange);
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

  // Expiration and Max Uses state
  const [expiresInHours, setExpiresInHours] = React.useState<number>(168); // 7 days default
  const [maxUses, setMaxUses] = React.useState<number>(0); // Unlimited default

  // Generate invite code when modal opens or settings change
  const generateInvite = React.useCallback(async () => {
    if (!server?.id || !user) return;
    setIsGenerating(true);
    try {
      const res = await createInvite(server.id, maxUses, expiresInHours);
      if (res.invite?.code) {
        setInviteCode(res.invite.code);
      } else if (res.error) {
        toast({
          title: 'Could Not Create Invite',
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
  }, [open, server?.id, expiresInHours, maxUses, generateInvite]);

  if (!open) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://nexus.gg';
  const inviteLink = inviteCode ? `${origin}/invite/${inviteCode}` : `${origin}/invite/...`;

  const handleCopyLink = () => {
    if (!inviteCode) return;
    try {
      navigator.clipboard.writeText(inviteLink);
      setCopiedLink(true);
      toast({
        title: 'Invite Link Copied',
        description: 'Share this link with your squadmates to let them join.',
        type: 'success',
      });
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      void err;
    }
  };

  const handleSendInviteToFriend = async (friendId: string, friendName: string) => {
    if (!user || !inviteCode) return;
    setInvitingId(friendId);
    try {
      const { conversationId, error } = await getOrCreateDirectConversation(friendId);
      if (error || !conversationId) {
        throw new Error(error || 'Failed to open DM');
      }

      const supabase = getBrowserClient();
      const inviteMsg = `Hey! Join my squad server "${server.name}" on Nexus: ${inviteLink}`;

      const { error: msgErr } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: inviteMsg,
      });

      if (msgErr) throw msgErr;

      setInvitedMap((prev) => ({ ...prev, [friendId]: true }));
      toast({
        title: 'Invite Sent!',
        description: `Sent server invite link directly to ${friendName}.`,
        type: 'success',
      });
    } catch (err: any) {
      toast({
        title: 'Could Not Send Invite',
        description: err?.message || 'Failed to send invite message.',
        type: 'error',
      });
    } finally {
      setInvitingId(null);
    }
  };

  const filteredFriends = friends.filter(
    (f) =>
      f.friend.display_name.toLowerCase().includes(search.toLowerCase()) ||
      f.friend.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-md animate-in fade-in"
        onClick={() => onOpenChange(false)}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-surface-panel p-4 sm:p-5 shadow-2xl shadow-black/90 z-10 animate-in zoom-in-95 duration-150 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Invite Squadmates</h3>
              <p className="text-xs text-muted-foreground/70 truncate max-w-[260px]">
                Invite players to &quot;{server.name}&quot;
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close dialog"
            className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-white/[0.04] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1-Click Shareable Link */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Invite Link
            </label>
            {isGenerating && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                <Loader2 className="w-3 h-3 animate-spin" /> Generating...
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 bg-white/[0.02] border border-white/[0.08] rounded-xl p-1.5 pl-3">
            <span className="text-xs text-foreground/80 font-mono truncate flex-1 select-all">
              {inviteLink}
            </span>
            <Button
              size="sm"
              onClick={handleCopyLink}
              disabled={!inviteCode || isGenerating}
              className="h-7 px-3 text-xs font-medium gap-1.5 shrink-0"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
            </Button>
          </div>
        </div>

        {/* Expiration and Max Uses selectors */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3 h-3 text-primary" /> Expire After
            </label>
            <select
              value={expiresInHours}
              onChange={(e) => setExpiresInHours(Number(e.target.value))}
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-2 py-1.5 text-foreground text-xs focus:outline-none focus:border-primary/50"
            >
              {EXPIRY_OPTIONS.map((opt) => (
                <option key={opt.hours} value={opt.hours} className="bg-surface-panel text-foreground">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Hash className="w-3 h-3 text-primary" /> Max Uses
            </label>
            <select
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value))}
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-2 py-1.5 text-foreground text-xs focus:outline-none focus:border-primary/50"
            >
              {MAX_USES_OPTIONS.map((opt) => (
                <option key={opt.uses} value={opt.uses} className="bg-surface-panel text-foreground">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Direct Invite Friends List */}
        <div className="space-y-2 pt-1 border-t border-white/[0.06]">
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            <span>Invite Friends Directly</span>
            <span className="text-[10px] font-mono lowercase">({friends.length} friends)</span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted-foreground/50 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search friends to invite..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
            />
          </div>

          <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
            {filteredFriends.length === 0 ? (
              <div className="text-center py-4 text-xs text-muted-foreground/60 font-mono">
                No friends found matching &quot;{search}&quot;
              </div>
            ) : (
              filteredFriends.map((f) => {
                const isInvited = Boolean(invitedMap[f.friend.id]);
                const isInviting = invitingId === f.friend.id;

                return (
                  <div
                    key={f.friend.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <Avatar
                        src={f.friend.avatar_url || null}
                        name={f.friend.display_name}
                        status={f.friend.status}
                        showStatus
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-foreground truncate">
                          {f.friend.display_name}
                        </div>
                        <div className="text-[10px] text-muted-foreground/50 font-mono truncate">
                          @{f.friend.username}
                        </div>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant={isInvited ? 'outline' : 'default'}
                      disabled={isInvited || isInviting || !inviteCode}
                      onClick={() => handleSendInviteToFriend(f.friend.id, f.friend.display_name)}
                      className={cn(
                        'h-7 text-xs px-2.5 font-medium transition-all shrink-0',
                        isInvited && 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                      )}
                    >
                      {isInvited ? (
                        <span className="flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>Sent</span>
                        </span>
                      ) : isInviting ? (
                        <span>Sending...</span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Send className="w-3 h-3" />
                          <span>Invite</span>
                        </span>
                      )}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
