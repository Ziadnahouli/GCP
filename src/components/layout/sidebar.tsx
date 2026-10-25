'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Users,
  Search,
  Plus,
  UserPlus,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/features/auth/auth-provider';
import { useUserPresence } from '@/features/presence/presence-context';
import { useConversations } from '@/hooks/use-conversations';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { CreateGroupModal } from '@/components/chat/create-group-modal';
import { cn } from '@/lib/utils';

function formatConversationTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) {
      return d.toLocaleDateString([], { weekday: 'short' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function ConversationItemAvatar({
  otherMemberId,
  title,
  avatarUrl,
  isGroup,
}: {
  otherMemberId?: string;
  title: string;
  avatarUrl?: string | null;
  isGroup: boolean;
}) {
  const status = useUserPresence(otherMemberId);
  if (isGroup) {
    return (
      <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center text-muted-foreground shrink-0">
        <Users className="w-4 h-4" />
      </div>
    );
  }
  return (
    <Avatar
      src={avatarUrl}
      name={title}
      status={status}
      showStatus
      size="32"
    />
  );
}

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  selectedConversationId?: string | null;
  onSelectConversation?: (id: string | null) => void;
}

export function Sidebar({
  collapsed = false,
  onToggleCollapse,
  selectedConversationId,
  onSelectConversation,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { conversations } = useConversations();
  const [showCreateGroup, setShowCreateGroup] = React.useState(false);
  const [filterText, setFilterText] = React.useState('');

  const sortedConversations = React.useMemo(() => {
    return [...conversations].sort((a, b) => {
      const timeA = a.last_message?.created_at ? new Date(a.last_message.created_at).getTime() : 0;
      const timeB = b.last_message?.created_at ? new Date(b.last_message.created_at).getTime() : 0;
      return timeB - timeA;
    });
  }, [conversations]);

  const filteredConversations = React.useMemo(() => {
    if (!filterText.trim()) return sortedConversations;
    const q = filterText.toLowerCase();
    return sortedConversations.filter((conv) => {
      if (conv.name && conv.name.toLowerCase().includes(q)) return true;
      const otherMember = conv.members.find((m) => m.user_id !== user?.id)?.profile;
      if (otherMember?.display_name?.toLowerCase().includes(q)) return true;
      if (otherMember?.username?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [sortedConversations, filterText, user?.id]);

  const handleOpenSearch = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nexus:open-command-palette'));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    }
  };

  return (
    <div className="w-full h-full bg-surface-sidebar flex flex-col justify-between select-none">
      <div className="overflow-y-auto flex-1 no-scrollbar">
        {/* Header / Search Button (Ctrl K) */}
        <div className="h-[52px] border-b border-border flex items-center px-3 shrink-0">
          <button
            type="button"
            onClick={handleOpenSearch}
            className="w-full h-8 px-2.5 rounded-control bg-background border border-border flex items-center justify-between text-xs text-muted-foreground hover:border-border-strong hover:text-foreground transition-colors duration-fast"
            title="Open command palette (Ctrl+K)"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Find or start a conversation</span>
            </div>
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-surface-hover text-muted-foreground text-xs font-mono border border-border">
              Ctrl K
            </kbd>
          </button>
        </div>

        {/* Primary Social Nav Items */}
        <div className="p-2 space-y-0.5">
          <button
            type="button"
            onClick={() => {
              onSelectConversation?.(null);
              router.push('/');
            }}
            className={cn(
              'w-full flex items-center gap-2.5 rounded-control px-2.5 py-1.5 text-xs font-medium transition-colors duration-fast ease-pro text-left',
              !selectedConversationId && pathname === '/'
                ? 'bg-surface-active text-foreground font-semibold'
                : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
            )}
          >
            <Users
              className={cn(
                'w-4 h-4 shrink-0 transition-colors',
                !selectedConversationId && pathname === '/' ? 'text-primary' : 'text-muted-foreground'
              )}
            />
            <span className="flex-1">Friends</span>
          </button>
        </div>

        {/* Direct Messages Section */}
        <div className="px-2 pt-2">
          <div className="flex items-center justify-between px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Direct messages</span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setShowCreateGroup(true)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-control hover:bg-surface-hover transition-colors"
                title="Create group"
                aria-label="Create group"
              >
                <Users className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectConversation?.(null);
                  router.push('/');
                }}
                className="text-muted-foreground hover:text-foreground p-1 rounded-control hover:bg-surface-hover transition-colors"
                title="New direct message"
                aria-label="New direct message"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-0.5 mt-1">
            {filteredConversations.length === 0 ? (
              <div className="p-3 text-center rounded-control border border-border bg-card/40 space-y-1.5 my-2">
                <p className="text-xs text-muted-foreground">No conversations yet</p>
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="w-full py-1 px-2 rounded-control bg-secondary hover:bg-surface-hover text-foreground text-xs font-medium transition-colors"
                >
                  Start a chat
                </button>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isGroup = conv.type === 'group';
                const otherMemberRow = conv.members.find((m) => m.user_id !== user?.id);
                const otherMember = otherMemberRow?.profile || null;
                const otherMemberId = otherMemberRow?.user_id || otherMember?.id;
                const isSelected = selectedConversationId === conv.id;
                const title = isGroup ? (conv.name || 'Group conversation') : (otherMember?.display_name || 'Conversation');
                const hasUnread = Boolean(conv.unread_count && conv.unread_count > 0 && !isSelected);

                return (
                  <button
                    type="button"
                    key={conv.id}
                    onClick={() => {
                      onSelectConversation?.(conv.id);
                      router.push(`/?c=${conv.id}`);
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-2.5 py-2 rounded-control cursor-pointer transition-colors duration-fast ease-pro group relative text-left min-h-[48px] max-sm:min-h-[56px] overflow-hidden',
                      isSelected
                        ? 'bg-surface-active text-foreground font-semibold'
                        : hasUnread
                        ? 'bg-primary-subtle text-foreground font-semibold'
                        : 'hover:bg-surface-hover text-muted-foreground hover:text-foreground'
                    )}
                    title={title}
                  >
                    {isSelected && (
                      <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-primary rounded-r" />
                    )}
                    <div className="relative shrink-0">
                      <ConversationItemAvatar
                        otherMemberId={otherMemberId}
                        title={title}
                        avatarUrl={otherMember?.avatar_url}
                        isGroup={isGroup}
                      />
                    </div>

                    <div className="min-w-0 flex-1 flex flex-col justify-center">
                      <div className="flex items-center justify-between gap-1.5">
                        <span
                          className={cn(
                            'truncate text-body leading-tight',
                            hasUnread || isSelected ? 'font-semibold text-foreground' : 'text-foreground/90 group-hover:text-foreground font-medium'
                          )}
                        >
                          {title}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {conv.last_message?.created_at && (
                            <span className="text-meta text-muted-foreground tabular-nums">
                              {formatConversationTime(conv.last_message.created_at)}
                            </span>
                          )}
                          {hasUnread && (
                            <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                          )}
                        </div>
                      </div>
                      {conv.last_message && (
                        <div
                          className={cn(
                            'text-xs truncate leading-tight mt-0.5',
                            hasUnread ? 'text-foreground font-medium' : 'text-muted-foreground'
                          )}
                        >
                          {conv.last_message.content}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      <CreateGroupModal
        open={showCreateGroup}
        onOpenChange={setShowCreateGroup}
        onGroupCreated={(id) => {
          onSelectConversation?.(id);
          router.push(`/?c=${id}`);
        }}
      />
    </div>
  );
}

