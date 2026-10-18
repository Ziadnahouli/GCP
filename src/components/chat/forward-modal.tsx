'use client';

import * as React from 'react';
import { Forward, Search, Send, Loader2, Check, Hash, MessageSquare, Users } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { useAuth } from '@/features/auth/auth-provider';
import { useConversations } from '@/hooks/use-conversations';
import { useServers } from '@/hooks/use-servers';
import { Message } from '@/lib/types/messaging';
import { useToast } from '@/components/ui/toast';
import { getBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface ForwardModalProps {
  message: Message | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onForwarded?: () => void;
}

export function ForwardModal({ message, open, onOpenChange, onForwarded }: ForwardModalProps) {
  const { user } = useAuth();
  const { conversations } = useConversations();
  const { servers } = useServers();
  const { toast } = useToast();
  const supabase = React.useMemo(() => getBrowserClient(), []);

  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedTarget, setSelectedTarget] = React.useState<{
    type: 'dm' | 'channel';
    id: string;
    name: string;
  } | null>(null);
  const [isSending, setIsSending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setSearchQuery('');
      setSelectedTarget(null);
      setIsSending(false);
    }
  }, [open]);

  if (!message) return null;

  // Flatten DM conversations and Server channels
  const dmTargets = conversations.map((conv) => {
    const isGroup = conv.type === 'group';
    const otherMember = conv.members.find((m) => m.user_id !== user?.id)?.profile;
    const name = isGroup ? (conv.name || 'Squad Group') : (otherMember?.display_name || 'DM');
    return {
      type: 'dm' as const,
      id: conv.id,
      name,
      isGroup,
      avatarUrl: isGroup ? null : otherMember?.avatar_url,
    };
  });

  const channelTargets = servers.flatMap((server) =>
    (server.channels || [])
      .filter((ch) => ch.type === 'text')
      .map((ch) => ({
        type: 'channel' as const,
        id: ch.id,
        name: `${server.name} > #${ch.name}`,
        serverName: server.name,
      }))
  );

  const allTargets = [...dmTargets, ...channelTargets];
  const filteredTargets = allTargets.filter((t) =>
    !searchQuery.trim() || t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleForward = async () => {
    if (!selectedTarget || !user) return;
    setIsSending(true);

    try {
      const authorName = message.sender?.display_name || 'User';
      const authorTag = message.sender?.username ? `@${message.sender.username}` : authorName;
      const forwardedContent = `[Forwarded from ${authorTag}]\n${message.content}`;

      if (selectedTarget.type === 'dm') {
        const { error } = await supabase.from('messages').insert({
          conversation_id: selectedTarget.id,
          sender_id: user.id,
          content: forwardedContent,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('channel_messages').insert({
          channel_id: selectedTarget.id,
          user_id: user.id,
          content: forwardedContent,
        });
        if (error) throw error;
      }

      toast({
        title: 'Message Forwarded',
        description: `Dispatched to ${selectedTarget.name}.`,
        type: 'success',
      });

      onOpenChange(false);
      onForwarded?.();
    } catch (err: any) {
      toast({
        title: 'Forwarding Failed',
        description: err?.message || 'Could not forward message.',
        type: 'error',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md w-full p-6 border border-white/[0.08] bg-[#0c0d14] text-foreground rounded-2xl shadow-2xl"
        onClose={() => onOpenChange(false)}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary">
              <Forward className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Forward Message</h2>
              <p className="text-xs text-muted-foreground">
                Share this message with another squad or channel with attribution.
              </p>
            </div>
          </div>

          {/* Message Preview */}
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs text-muted-foreground/80 italic max-h-20 overflow-y-auto">
            &ldquo;{message.content.slice(0, 160)}
            {message.content.length > 160 ? '...' : ''}&rdquo;
          </div>

          {/* Search Targets */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chat or channel..."
              className="text-xs pl-8 bg-white/[0.03] border-white/10 h-8"
            />
          </div>

          {/* Destination Target List */}
          <div className="max-h-52 overflow-y-auto space-y-1 pr-1 select-none">
            {filteredTargets.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No destination chats or channels found.
              </div>
            ) : (
              filteredTargets.map((target) => {
                const isSelected = selectedTarget?.id === target.id;
                return (
                  <div
                    key={`${target.type}-${target.id}`}
                    onClick={() => setSelectedTarget(target)}
                    className={cn(
                      'flex items-center justify-between p-2 rounded-xl transition cursor-pointer border',
                      isSelected
                        ? 'bg-primary/15 border-primary/40 text-foreground'
                        : 'bg-white/[0.02] border-white/[0.04] text-muted-foreground hover:bg-white/[0.04]'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {target.type === 'dm' ? (
                        (target as any).isGroup ? (
                          <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center text-primary">
                            <Users className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <Avatar
                            src={(target as any).avatarUrl}
                            name={target.name}
                            size="sm"
                          />
                        )
                      ) : (
                        <div className="w-6 h-6 rounded bg-white/[0.06] flex items-center justify-center text-muted-foreground">
                          <Hash className="w-3.5 h-3.5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-foreground truncate">
                          {target.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          {target.type === 'dm' ? 'Direct Message' : 'Server Channel'}
                        </div>
                      </div>
                    </div>

                    <div
                      className={cn(
                        'w-4 h-4 rounded-full border flex items-center justify-center transition-colors',
                        isSelected ? 'border-primary bg-primary' : 'border-white/20'
                      )}
                    >
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleForward}
              disabled={!selectedTarget || isSending}
              className="text-xs"
            >
              {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
              Forward Message
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
