'use client';

import * as React from 'react';
import {
  UserPlus,
  Copy,
  Check,
  Search,
  MessageSquare,
  Sparkles,
  X,
  Send,
  Users,
} from 'lucide-react';
import { Server } from '@/lib/types/server';
import { useSocial } from '@/hooks/use-social';
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

export function InviteModal({ open, onOpenChange, server }: InviteModalProps) {
  useModalEscape(open, onOpenChange);
  const { user } = useAuth();
  const { friends } = useSocial();
  const { getOrCreateDirectConversation } = useConversations();
  const { toast } = useToast();

  const [copiedLink, setCopiedLink] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [invitedMap, setInvitedMap] = React.useState<Record<string, boolean>>({});
  const [invitingId, setInvitingId] = React.useState<string | null>(null);

  if (!open) return null;

  const inviteLink = typeof window !== 'undefined'
    ? `${window.location.origin}/?join=${server.id}`
    : `https://nexus.gg/join/${server.id}`;

  const handleCopyLink = () => {
    try {
      navigator.clipboard.writeText(inviteLink);
      setCopiedLink(true);
      toast({
        title: 'Invite Link Copied',
        description: 'Share this link with your squadmates to let them join.',
        type: 'success',
      });
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
  };

  const handleCopyId = () => {
    try {
      navigator.clipboard.writeText(server.id);
      setCopiedId(true);
      toast({
        title: 'Server ID Copied',
        description: 'Friends can paste this in "Join with Invite".',
        type: 'success',
      });
      setTimeout(() => setCopiedId(false), 2000);
    } catch {}
  };

  const handleSendInviteToFriend = async (friendId: string, friendName: string) => {
    if (!user) return;
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
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
            Invite Link
          </label>
          <div className="flex items-center gap-1.5 bg-white/[0.02] border border-white/[0.08] rounded-xl p-1.5 pl-3">
            <span className="text-xs text-foreground/80 font-mono truncate flex-1 select-all">
              {inviteLink}
            </span>
            <Button
              size="sm"
              onClick={handleCopyLink}
              className="h-7 px-3 text-xs font-medium gap-1.5 shrink-0"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
            </Button>
          </div>
        </div>

        {/* Server ID for Direct Join */}
        <div className="flex items-center justify-between p-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02]">
          <div>
            <div className="text-[11px] text-muted-foreground font-mono">Server ID:</div>
            <div className="text-xs font-mono font-medium text-foreground select-all">
              {server.id}
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopyId}
            className="h-7 text-xs border-white/[0.08] hover:bg-white/[0.04] gap-1"
          >
            {copiedId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copiedId ? 'Copied' : 'Copy ID'}</span>
          </Button>
        </div>

        {/* Direct Invite Friends List */}
        <div className="space-y-2 pt-1">
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

          <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
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
                      disabled={isInvited || isInviting}
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
