'use client';

import * as React from 'react';
import {
  ArrowDown,
  Loader2,
  X,
  Download,
} from 'lucide-react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { GroupSettingsModal } from '@/components/chat/group-settings-modal';
import { ForwardModal } from '@/components/chat/forward-modal';
import { ReportModal } from '@/components/social/report-modal';
import { SoundboardModal } from '@/components/soundboard/soundboard-modal';
import { ChatHeader } from '@/components/chat/chat-header';
import { ChatMessageRow } from '@/components/chat/chat-message-row';
import { ChatComposer } from '@/components/chat/chat-composer';
import { useAuth } from '@/features/auth/auth-provider';
import { useMessages } from '@/hooks/use-messages';
import { useConversations } from '@/hooks/use-conversations';
import { useCallActions } from '@/features/calls/call-context';
import { usePresence } from '@/features/presence/presence-context';
import { Message, MessageAttachment } from '@/lib/types/messaging';
import { useToast } from '@/components/ui/toast';
import { getBrowserClient } from '@/lib/supabase/client';

interface ChatViewProps {
  conversationId: string;
  onBack?: () => void;
}

function formatDateSeparator(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) {
      return 'Today';
    }
    if (d.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function ChatView({ conversationId, onBack }: ChatViewProps) {
  const { user } = useAuth();
  const { conversations, markConversationAsRead, setActiveConversationId } = useConversations();
  const {
    messages,
    isLoading,
    typingUsers,
    searchQuery,
    setSearchQuery,
    showPinnedOnly,
    setShowPinnedOnly,
    sendMessage,
    retryMessage,
    sendTyping,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    togglePinMessage,
  } = useMessages(conversationId);

  const { startCall } = useCallActions();
  const { getUserStatus } = usePresence();
  const { toast } = useToast();
  const supabase = React.useMemo(() => getBrowserClient(), []);

  // Synchronize active conversation lifecycle
  React.useEffect(() => {
    if (setActiveConversationId && conversationId) {
      setActiveConversationId(conversationId);
    }
    return () => {
      if (setActiveConversationId) {
        setActiveConversationId(null);
      }
    };
  }, [conversationId, setActiveConversationId]);

  // Read marking & unread divider tracking
  const [newMessagesDividerId, setNewMessagesDividerId] = React.useState<string | null>(null);
  const lastMarkedCountRef = React.useRef<number>(-1);
  const isNearBottomRef = React.useRef(true);

  React.useEffect(() => {
    lastMarkedCountRef.current = -1;
    setNewMessagesDividerId(null);
  }, [conversationId]);

  const checkAndMarkRead = React.useCallback(() => {
    if (!conversationId || !markConversationAsRead) return;
    const isVisible = typeof document !== 'undefined' && !document.hidden;
    const isFocused = typeof document !== 'undefined' && (typeof document.hasFocus === 'function' ? document.hasFocus() : true);
    const isAtBottom = isNearBottomRef.current;

    if (isVisible && isFocused && isAtBottom) {
      markConversationAsRead(conversationId);
      lastMarkedCountRef.current = messages.length;
      setNewMessagesDividerId(null);
    }
  }, [conversationId, markConversationAsRead, messages.length]);

  React.useEffect(() => {
    if (!conversationId || !markConversationAsRead) return;
    if (messages.length === 0) return;

    if (lastMarkedCountRef.current === -1) {
      lastMarkedCountRef.current = messages.length;
      return;
    }

    const isVisible = typeof document !== 'undefined' && !document.hidden;
    const isFocused = typeof document !== 'undefined' && (typeof document.hasFocus === 'function' ? document.hasFocus() : true);
    const isAtBottom = isNearBottomRef.current;

    if (isVisible && isFocused && isAtBottom) {
      lastMarkedCountRef.current = messages.length;
      markConversationAsRead(conversationId);
      setNewMessagesDividerId(null);
    } else {
      if (!newMessagesDividerId && lastMarkedCountRef.current >= 0 && messages.length > lastMarkedCountRef.current) {
        const incomingMessages = messages.slice(lastMarkedCountRef.current);
        const firstIncomingOther = incomingMessages.find((m) => m.sender_id !== user?.id) || incomingMessages[0];
        if (firstIncomingOther) {
          setNewMessagesDividerId(firstIncomingOther.id);
        }
      }
    }
  }, [conversationId, markConversationAsRead, messages, newMessagesDividerId, user?.id]);

  // States
  const [replyingTo, setReplyingTo] = React.useState<Message | null>(null);
  const [showSearchInput, setShowSearchInput] = React.useState(false);
  const [showSoundboard, setShowSoundboard] = React.useState(false);
  const [showGroupSettings, setShowGroupSettings] = React.useState(false);
  const [forwardingMessage, setForwardingMessage] = React.useState<Message | null>(null);
  const [reportingMessage, setReportingMessage] = React.useState<Message | null>(null);
  const [selectedMediaModal, setSelectedMediaModal] = React.useState<MessageAttachment | null>(null);
  const [isScrolledUp, setIsScrolledUp] = React.useState(false);
  const virtuosoRef = React.useRef<VirtuosoHandle>(null);

  const currentConversation = React.useMemo(() => {
    return conversations.find((c) => c.id === conversationId) || null;
  }, [conversations, conversationId]);

  const [fetchedConversation, setFetchedConversation] = React.useState<any>(null);

  React.useEffect(() => {
    if (currentConversation) {
      setFetchedConversation(currentConversation);
      return;
    }
    if (!conversationId || !supabase) return;
    let active = true;
    supabase
      .from('conversations')
      .select('*, members:conversation_members(*, profile:profiles(*))')
      .eq('id', conversationId)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data) {
          setFetchedConversation(data);
        }
      });
    return () => {
      active = false;
    };
  }, [conversationId, currentConversation, supabase]);

  const effectiveConversation = currentConversation || fetchedConversation;
  const isGroup = effectiveConversation?.type === 'group';
  const otherMember = effectiveConversation?.members?.find((m: any) => m.user_id !== user?.id)?.profile;
  const targetUserId = otherMember?.id;

  // Blocked / Privacy verification
  const [dmBlockedReason, setDmBlockedReason] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isGroup || !targetUserId || !user?.id) {
      setDmBlockedReason(null);
      return;
    }

    let active = true;
    supabase
      .from('blocked_users')
      .select('id')
      .or(`and(user_id.eq.${user.id},blocked_user_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},blocked_user_id.eq.${user.id})`)
      .then(({ data }) => {
        if (!active) return;
        if (data && data.length > 0) {
          setDmBlockedReason('Direct messaging is unavailable because one of the accounts has blocked communication.');
        } else {
          setDmBlockedReason(null);
        }
      });

    return () => {
      active = false;
    };
  }, [isGroup, targetUserId, user?.id, supabase]);

  // Mention candidates
  const mentionCandidates = React.useMemo(() => {
    if (!effectiveConversation?.members) return [];
    return effectiveConversation.members
      .filter((m: any) => m.user_id !== user?.id && m.profile)
      .map((m: any) => ({
        id: m.profile.id,
        username: m.profile.username,
        display_name: m.profile.display_name,
        avatar_url: m.profile.avatar_url,
      }));
  }, [effectiveConversation?.members, user?.id]);

  // Handlers
  const handleVoiceCall = () => {
    if (!targetUserId) {
      toast({ title: 'Group call', description: 'Group voice calling is starting...', type: 'info' });
      return;
    }
    startCall(targetUserId, conversationId, false);
  };

  const handleVideoCall = () => {
    if (!targetUserId) {
      toast({ title: 'Group call', description: 'Group video calling is starting...', type: 'info' });
      return;
    }
    startCall(targetUserId, conversationId, true);
  };

  const handleSendMessage = async (content: string, files: File[]) => {
    await sendMessage(content, replyingTo?.id, files);
    setReplyingTo(null);
  };

  const handleEditMessage = (msg: Message) => {
    const updated = prompt('Edit message:', msg.content || '');
    if (updated !== null && updated.trim() && updated !== msg.content) {
      editMessage(msg.id, updated.trim());
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden relative">
      {/* Header */}
      <ChatHeader
        conversation={effectiveConversation}
        currentUserId={user?.id}
        getUserStatus={getUserStatus}
        showSearch={showSearchInput}
        onToggleSearch={() => {
          setShowSearchInput((prev) => !prev);
          if (showSearchInput) setSearchQuery('');
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        showPinnedOnly={showPinnedOnly}
        onTogglePinnedOnly={() => setShowPinnedOnly(!showPinnedOnly)}
        onVoiceCall={handleVoiceCall}
        onVideoCall={handleVideoCall}
        onOpenSoundboard={() => setShowSoundboard(true)}
        onOpenGroupSettings={isGroup ? () => setShowGroupSettings(true) : undefined}
        onBack={onBack}
      />

      {/* Message List */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {isLoading && messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-2 text-muted-foreground text-xs">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p>Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground text-xs space-y-1">
            <p className="font-semibold text-foreground">
              {showPinnedOnly ? 'No pinned messages' : 'No messages yet'}
            </p>
            <p className="max-w-xs">
              {showPinnedOnly
                ? 'Messages pinned by members will appear here.'
                : 'Send a message to start the conversation!'}
            </p>
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={messages}
            followOutput="auto"
            alignToBottom
            initialTopMostItemIndex={messages.length - 1}
            atBottomStateChange={(atBottom) => {
              isNearBottomRef.current = atBottom;
              setIsScrolledUp(!atBottom);
              if (atBottom) {
                checkAndMarkRead();
              }
            }}
            className="flex-1 no-scrollbar"
            itemContent={(index, msg) => {
              const prev = index > 0 ? messages[index - 1] : null;
              const isSameAuthor = prev && prev.sender_id === msg.sender_id;
              const isWithin5Min = prev && (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000);
              const isSameDay = prev && (new Date(msg.created_at).toDateString() === new Date(prev.created_at).toDateString());
              const isGrouped = Boolean(isSameAuthor && isWithin5Min && isSameDay && msg.id !== newMessagesDividerId);
              const showDateSeparator = !prev || new Date(msg.created_at).toDateString() !== new Date(prev.created_at).toDateString();

              return (
                <React.Fragment key={msg.id}>
                  {showDateSeparator && (
                    <div className="sticky top-2 z-10 flex items-center justify-center my-3 select-none pointer-events-none">
                      <span className="px-2.5 py-0.5 rounded-full bg-surface-sidebar border border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider shadow-subtle">
                        {formatDateSeparator(msg.created_at)}
                      </span>
                    </div>
                  )}

                  <ChatMessageRow
                    message={msg}
                    currentUserId={user?.id}
                    isGrouped={isGrouped}
                    isNewUnreadDivider={msg.id === newMessagesDividerId}
                    onReply={(m) => setReplyingTo(m)}
                    onEdit={handleEditMessage}
                    onDelete={(id) => deleteMessage(id)}
                    onTogglePin={(id) => togglePinMessage(id, msg.is_pinned)}
                    onForward={(m) => setForwardingMessage(m)}
                    onReport={(m) => setReportingMessage(m)}
                    onReactionAdd={(id, emoji) => addReaction(id, emoji)}
                    onReactionRemove={(id, emoji) => removeReaction(id, emoji)}
                    onRetry={(m) => retryMessage(m.id)}
                    onSelectMedia={(att) => setSelectedMediaModal(att)}
                  />
                </React.Fragment>
              );
            }}
          />
        )}

        {/* Typing Indicator */}
        {typingUsers.length > 0 && (
          <div className="px-4 py-1 text-xs text-muted-foreground flex items-center gap-1.5 animate-pulse shrink-0">
            <span>{typingUsers.join(', ')} is typing...</span>
          </div>
        )}

        {/* Jump to Latest Floating Pill */}
        {isScrolledUp && (
          <button
            type="button"
            onClick={() => {
              virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, align: 'end', behavior: 'smooth' });
              setIsScrolledUp(false);
            }}
            className="absolute bottom-4 right-4 z-20 px-3 py-1.5 rounded-full bg-primary text-primary-foreground font-semibold text-xs shadow-dialog flex items-center gap-1.5 hover:brightness-110 transition-all duration-fast"
            aria-label="Jump to latest message"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            <span>Jump to latest</span>
          </button>
        )}
      </div>

      {/* Composer */}
      <ChatComposer
        conversationId={conversationId}
        disabledReason={dmBlockedReason}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onSendMessage={handleSendMessage}
        onSendTyping={sendTyping}
        onOpenSoundboard={() => setShowSoundboard(true)}
        mentionCandidates={mentionCandidates}
      />

      {/* Media Lightbox Modal */}
      {selectedMediaModal && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-fast"
          onClick={() => setSelectedMediaModal(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between pb-2 text-foreground text-xs">
              <span className="font-semibold truncate">{selectedMediaModal.file_name}</span>
              <div className="flex items-center gap-2">
                {selectedMediaModal.url && (
                  <a
                    href={selectedMediaModal.url}
                    download={selectedMediaModal.file_name}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-control bg-card/80 text-foreground hover:bg-card"
                    title="Download media"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedMediaModal(null)}
                  className="p-1.5 rounded-control bg-card/80 text-foreground hover:bg-card"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedMediaModal.url}
              alt={selectedMediaModal.file_name}
              className="max-h-[80vh] w-auto rounded-card object-contain shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* Modals */}
      <SoundboardModal open={showSoundboard} onOpenChange={setShowSoundboard} />

      <GroupSettingsModal
        conversation={effectiveConversation}
        open={showGroupSettings}
        onOpenChange={setShowGroupSettings}
        onLeftGroup={() => onBack?.()}
      />

      <ForwardModal
        message={forwardingMessage}
        open={Boolean(forwardingMessage)}
        onOpenChange={(op) => !op && setForwardingMessage(null)}
      />

      <ReportModal
        reportedUserId={reportingMessage?.sender_id || null}
        reportedUserName={reportingMessage?.sender?.display_name || 'User'}
        messageId={reportingMessage?.id || null}
        open={Boolean(reportingMessage)}
        onOpenChange={(op) => !op && setReportingMessage(null)}
      />
    </div>
  );
}
