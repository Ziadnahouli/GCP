'use client';

import * as React from 'react';
import {
  Send,
  Smile,
  Paperclip,
  Phone,
  Video,
  Reply,
  Edit2,
  Trash2,
  Pin,
  Check,
  X,
  Gamepad2,
  Sparkles,
  ArrowLeft,
  Loader2,
  Search,
  FileText,
  Download,
  UploadCloud,
  Maximize2,
  File,
  Users,
  Forward,
  Flag,
  ArrowDown,
  Volume2,
  AlertTriangle,
} from 'lucide-react';
import { GroupSettingsModal } from '@/components/chat/group-settings-modal';
import { ForwardModal } from '@/components/chat/forward-modal';
import { ReportModal } from '@/components/social/report-modal';
import { useAuth } from '@/features/auth/auth-provider';
import { useMessages } from '@/hooks/use-messages';
import { useConversations } from '@/hooks/use-conversations';
import { useSocial } from '@/hooks/use-social';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Message, MessageAttachment } from '@/lib/types/messaging';
import { validateFile, formatFileSize } from '@/lib/storage/upload';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { useCallContext } from '@/features/calls/call-context';
import { usePresence } from '@/features/presence/presence-context';
import { getBrowserClient } from '@/lib/supabase/client';
import { SoundboardModal } from '@/components/soundboard/soundboard-modal';
import { triggerOpenLogsWindow } from '@/hooks/use-diagnostics-logs';
import { MessageContent } from '@/components/chat/message-content';

interface ChatViewProps {
  conversationId: string;
  onBack?: () => void;
}

const COMMON_EMOJIS = ['🔥', '🎯', '👍', '💀', '😂', '❤️', '🚀', 'GG'];

export function ChatView({ conversationId, onBack }: ChatViewProps) {
  const { user, profile } = useAuth();
  const { conversations, markConversationAsRead, setActiveConversationId } = useConversations();
  const {
    messages,
    rawMessages,
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

  // Automatically mark conversation as read when viewing and when new messages arrive
  const lastMarkedCountRef = React.useRef<number>(-1);
  React.useEffect(() => {
    if (!conversationId || !markConversationAsRead) return;
    if (lastMarkedCountRef.current !== messages.length) {
      lastMarkedCountRef.current = messages.length;
      markConversationAsRead(conversationId);
    }
  }, [conversationId, markConversationAsRead, messages.length]);

  const call = useCallContext();
  const { toast } = useToast();
  const { getUserStatus } = usePresence();

  const [inputContent, setInputContent] = React.useState('');
  const [replyingTo, setReplyingTo] = React.useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = React.useState<string | null>(null);
  const [editContent, setEditContent] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);

  // File uploads state & drag-and-drop
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
  const [isDraggingOver, setIsDraggingOver] = React.useState(false);
  const [selectedMediaModal, setSelectedMediaModal] = React.useState<MessageAttachment | null>(null);
  const [showSearchInput, setShowSearchInput] = React.useState(false);
  const [showSoundboard, setShowSoundboard] = React.useState(false);

  // Mention autocomplete candidates state
  const [mentionCandidates, setMentionCandidates] = React.useState<
    Array<{
      id: string;
      username: string;
      display_name: string;
      avatar_url?: string | null;
      isSpecial?: boolean;
    }>
  >([]);
  const [mentionSelectedIndex, setMentionSelectedIndex] = React.useState(0);

  // Phase 4: Group settings, forward, report, draft, and jump-to-latest
  const [showGroupSettings, setShowGroupSettings] = React.useState(false);
  const [forwardingMessage, setForwardingMessage] = React.useState<Message | null>(null);
  const [reportingMessage, setReportingMessage] = React.useState<Message | null>(null);
  const [isScrolledUp, setIsScrolledUp] = React.useState(false);

  // Restore draft for this conversation
  React.useEffect(() => {
    if (typeof window !== 'undefined' && conversationId) {
      const saved = localStorage.getItem(`nexus_draft_conv_${conversationId}`);
      if (saved) setInputContent(saved);
    }
  }, [conversationId]);

  // Persist draft on edit
  React.useEffect(() => {
    if (typeof window !== 'undefined' && conversationId) {
      if (inputContent) {
        localStorage.setItem(`nexus_draft_conv_${conversationId}`, inputContent);
      } else {
        localStorage.removeItem(`nexus_draft_conv_${conversationId}`);
      }
    }
  }, [inputContent, conversationId]);

  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const isNearBottomRef = React.useRef(true);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const nearBottom = scrollHeight - scrollTop - clientHeight < 150;
    isNearBottomRef.current = nearBottom;
    setIsScrolledUp(!nearBottom);
  };

  const supabase = React.useMemo(() => getBrowserClient(), []);

  const currentConversation = React.useMemo(() => {
    return conversations.find((c) => c.id === conversationId) || null;
  }, [conversations, conversationId]);

  // Fallback direct conversation fetch if cache is still hydrating
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
      .select(`
        id,
        name,
        type,
        created_by,
        avatar_url,
        members:conversation_members(
          id,
          user_id,
          role,
          profile:user_id(id, username, display_name, avatar_url, status)
        )
      `)
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
  const isGroup =
    effectiveConversation?.type === 'group' ||
    Boolean((effectiveConversation as any)?.is_group) ||
    (effectiveConversation?.members || []).length > 2;

  const [activeCallSession, setActiveCallSession] = React.useState<any>(null);
  const callIsSquadCallActiveRef = React.useRef(call.isSquadCallActive);
  callIsSquadCallActiveRef.current = call.isSquadCallActive;

  React.useEffect(() => {
    if (!conversationId || !supabase) {
      setActiveCallSession(null);
      return;
    }

    const checkCallSession = async () => {
      try {
        const { data } = await supabase
          .from('call_sessions')
          .select('id, caller_id, status, started_at')
          .eq('conversation_id', conversationId)
          .in('status', ['active', 'ringing', 'in_call'])
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          setActiveCallSession(data);
        } else if (!callIsSquadCallActiveRef.current?.(conversationId)) {
          setActiveCallSession(null);
        }
      } catch {}
    };

    checkCallSession();

    // 1. Database level postgres changes
    const dbChannel = supabase
      .channel(`active_call_session_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_sessions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          checkCallSession();
        }
      )
      .subscribe();

    // 2. Real-time WebRTC broadcast channel for instant banner updates
    const roomChannel = supabase
      .channel(`call-room-${conversationId}`)
      .on('broadcast', { event: 'squad_call_active' }, (payload: any) => {
        setActiveCallSession(payload.payload || { status: 'active', started_at: new Date().toISOString() });
      })
      .on('broadcast', { event: 'squad_call_ended' }, () => {
        setActiveCallSession(null);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          roomChannel.send({
            type: 'broadcast',
            event: 'query_squad_call',
            payload: { conversation_id: conversationId },
          }).catch(() => {});
        }
      });

    // Periodic poll for active squad call sessions every 4s
    const pollTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      checkCallSession();
    }, 4000);

    return () => {
      clearInterval(pollTimer);
      supabase.removeChannel(dbChannel);
      supabase.removeChannel(roomChannel);
    };
  }, [conversationId, supabase]);

  const isSquadCallActive = Boolean(
    activeCallSession ||
    (conversationId && (call.activeSquadCalls?.get(conversationId) || call.isSquadCallActive?.(conversationId))) ||
    (call.incomingCall?.isGroup && call.incomingCall?.conversationId === conversationId) ||
    (call.callStatus === 'incoming_ringing' && call.activeConversationId === conversationId && isGroup) ||
    (call.callStatus === 'in_call' && call.activeConversationId === conversationId && isGroup)
  );

  const latestSquadCallMsgId = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (
        messages[i].content?.includes('join-squad-call') ||
        messages[i].content?.includes('join-call')
      ) {
        return messages[i].id;
      }
    }
    return null;
  }, [messages]);

  const otherMember = React.useMemo(() => {
    if (!effectiveConversation) return null;
    return (effectiveConversation.members || []).find((m: any) => m.user_id !== user?.id) || null;
  }, [effectiveConversation, user]);

  const [directRecipient, setDirectRecipient] = React.useState<{
    id: string;
    profile: any;
  } | null>(null);

  React.useEffect(() => {
    if (otherMember) {
      setDirectRecipient({
        id: otherMember.user_id,
        profile: otherMember.profile,
      });
      return;
    }

    if (!conversationId || !user) return;

    let isMounted = true;
    async function resolveDirectMember() {
      const { data } = await supabase
        .from('conversation_members')
        .select(`
          user_id,
          profile:user_id (
            id, username, display_name, avatar_url, banner_url, banner_color,
            bio, custom_status, status, game_activity, created_at, updated_at
          )
        `)
        .eq('conversation_id', conversationId)
        .neq('user_id', user?.id)
        .maybeSingle();

      if (isMounted && data) {
        setDirectRecipient({
          id: data.user_id,
          profile: data.profile,
        });
      }
    }

    resolveDirectMember();
    return () => {
      isMounted = false;
    };
  }, [conversationId, user, otherMember, supabase]);

  const targetMember = otherMember?.profile || directRecipient?.profile || null;
  const targetUserId = otherMember?.user_id || directRecipient?.id || null;

  // Direct Message Privacy Enforcement
  const { friends } = useSocial();
  const [recipientPrivacy, setRecipientPrivacy] = React.useState<{
    allow_direct_messages?: 'everyone' | 'friends' | 'none';
  } | null>(null);

  React.useEffect(() => {
    if (!targetUserId || !supabase || isGroup) {
      setRecipientPrivacy(null);
      return;
    }
    let isMounted = true;
    const fetchPolicy = async () => {
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('get_user_dm_policy', {
          p_user_id: targetUserId,
        });
        if (isMounted && !rpcErr && rpcData) {
          setRecipientPrivacy(rpcData as any);
          return;
        }

        const { data } = await supabase
          .from('user_settings')
          .select('allow_direct_messages')
          .eq('user_id', targetUserId)
          .maybeSingle();

        if (isMounted && data) {
          setRecipientPrivacy(data as any);
        }
      } catch {}
    };

    fetchPolicy();
    return () => {
      isMounted = false;
    };
  }, [targetUserId, supabase, isGroup]);

  const isFriend = React.useMemo(() => {
    if (!targetUserId) return false;
    return friends.some((f) => f.id === targetUserId || (f as any).friend?.id === targetUserId);
  }, [friends, targetUserId]);

  const dmBlockedReason = React.useMemo(() => {
    if (isGroup || !recipientPrivacy) return null;
    const policy = recipientPrivacy.allow_direct_messages;
    if (policy === 'none') {
      return 'This user does not accept direct messages from anyone.';
    }
    if (policy === 'friends' && !isFriend) {
      return 'This user only accepts direct messages from friends.';
    }
    return null;
  }, [isGroup, recipientPrivacy, isFriend]);

  const pinnedCount = React.useMemo(() => {
    return rawMessages.filter((m) => m.is_pinned).length;
  }, [rawMessages]);

  React.useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, typingUsers]);

  // Handle file addition
  const handleAddFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const validation = validateFile(file);
      if (!validation.valid) {
        toast({
          title: 'File Rejected',
          description: `${file.name}: ${validation.error}`,
          type: 'error',
        });
      } else {
        validFiles.push(file);
      }
    }

    if (validFiles.length > 0) {
      setSelectedFiles((prev) => [...prev, ...validFiles]);
      toast({
        title: 'File Attached',
        description: `Attached ${validFiles.length} file(s) for your message.`,
        type: 'info',
        duration: 2000,
      });
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    handleAddFiles(e.dataTransfer.files);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = inputContent.trim();
    if ((!content && selectedFiles.length === 0) || isSending) return;

    const replyId = replyingTo ? replyingTo.id : null;
    const filesToSend = [...selectedFiles];

    setIsSending(true);
    try {
      const res = await sendMessage(content, replyId, filesToSend);
      if (res?.error) {
        toast({
          title: 'Message Not Delivered',
          description: `${res.error}`,
          type: 'error',
          action: {
            label: 'Open Logs',
            onClick: () => triggerOpenLogsWindow(),
          },
        });
        // Preserves user's draft in inputContent & selectedFiles
      } else {
        setInputContent('');
        setSelectedFiles([]);
        setReplyingTo(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem(`nexus_draft_conv_${conversationId}`);
        }
        inputRef.current?.focus();
        // Unconditional scroll to bottom when current user sends a message
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        setIsScrolledUp(false);
        isNearBottomRef.current = true;
      }
    } catch (err: unknown) {
      toast({
        title: 'Error Sending Message',
        description: err instanceof Error ? err.message : 'Failed to send message',
        type: 'error',
        action: {
          label: 'Open Logs',
          onClick: () => triggerOpenLogsWindow(),
        },
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleVoiceCallClick = async () => {
    if (isGroup) {
      if (activeCallSession || call.isSquadCallActive?.(conversationId)) {
        if (call.callStatus === 'incoming_ringing') {
          call.acceptCall();
        } else {
          call.startCall(conversationId, conversationId, false);
        }
        return;
      }

      // Starting new group squad call: notify group and mention all other members
      const otherMembers = (effectiveConversation?.members || []).filter((m: any) => m.user_id !== user?.id);
      const mentions = otherMembers
        .map((m: any) => (m.profile?.username ? `@${m.profile.username}` : ''))
        .filter(Boolean)
        .join(' ');

      const announcement = `📞 Started a squad voice call. [join-squad-call:${conversationId}] ${mentions ? `Hey ${mentions}, click Join Voice to connect!` : 'Click Join Voice to connect!'}`;

      sendMessage(announcement).catch(() => {});
      call.startCall(conversationId, conversationId, false);
    } else {
      const peerId = targetUserId || conversationId;
      call.startCall(peerId, conversationId, false);
    }
  };

  // Mention autocomplete logic
  const handleInputChange = (val: string) => {
    setInputContent(val);
    const cursor = inputRef.current?.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_.-]*)$/);

    if (match) {
      const query = match[1].toLowerCase();
      const membersList = (effectiveConversation?.members || []).map((m: any) => ({
        id: m.user_id,
        username: m.profile?.username || 'user',
        display_name: m.profile?.display_name || 'Squadmate',
        avatar_url: m.profile?.avatar_url || null,
        isSpecial: false,
      }));

      const specials = isGroup
        ? [
            { id: 'everyone', username: 'everyone', display_name: 'Everyone in Squad', avatar_url: null, isSpecial: true },
            { id: 'all', username: 'all', display_name: 'All Members', avatar_url: null, isSpecial: true },
          ]
        : [];

      const allTargets = [...specials, ...membersList];
      const filtered = allTargets.filter(
        (t) =>
          t.username.toLowerCase().includes(query) ||
          t.display_name.toLowerCase().includes(query)
      );

      setMentionCandidates(filtered);
      setMentionSelectedIndex(0);
    } else {
      setMentionCandidates([]);
    }
  };

  const insertMention = (targetUsername: string) => {
    const cursor = inputRef.current?.selectionStart ?? inputContent.length;
    const textBeforeCursor = inputContent.slice(0, cursor);
    const textAfterCursor = inputContent.slice(cursor);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    if (atIndex !== -1) {
      const newBefore = textBeforeCursor.slice(0, atIndex) + `@${targetUsername} `;
      const newFull = newBefore + textAfterCursor;
      setInputContent(newFull);
      setMentionCandidates([]);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.setSelectionRange(newBefore.length, newBefore.length);
        }
      }, 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    sendTyping();

    if (mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionSelectedIndex((prev) => (prev + 1) % mentionCandidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionSelectedIndex((prev) => (prev - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = mentionCandidates[mentionSelectedIndex];
        if (selected) {
          insertMention(selected.username);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionCandidates([]);
        return;
      }
    }
  };

  const handleStartEdit = (msg: Message) => {
    setEditingMessageId(msg.id);
    setEditContent(msg.content);
  };

  const handleSaveEdit = async (messageId: string) => {
    if (!editContent.trim()) return;
    await editMessage(messageId, editContent);
    setEditingMessageId(null);
    toast({ title: 'Message Edited', description: 'Updated successfully', type: 'info' });
  };

  const formatTimestamp = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '';
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    } catch {
      return '';
    }
  };

  return (
    <div
      className="flex-1 flex flex-col h-full bg-background overflow-hidden relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 bg-background/90 backdrop-blur-md flex flex-col items-center justify-center border-2 border-dashed border-primary animate-in fade-in duration-150 pointer-events-none">
          <UploadCloud className="w-16 h-16 text-primary animate-bounce mb-3" />
          <h3 className="text-xl font-bold text-foreground">Drop Files to Upload</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Attach gameplay screenshots, videos, or tactical docs (Max 25MB)
          </p>
        </div>
      )}

      {/* Chat Top Header */}
      <div className="h-12 border-b border-white/[0.06] px-3 sm:px-4 flex items-center justify-between shrink-0 select-none bg-surface-header">
        <div className="flex items-center gap-2.5 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden p-1.5 -ml-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/[0.04]"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          {/* Member / Chat Avatar */}
          {isGroup ? (
            <div
              onClick={() => setShowGroupSettings(true)}
              className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center text-primary cursor-pointer hover:bg-primary/30 transition shrink-0"
              title="Squad Settings"
            >
              <Users className="w-4 h-4" />
            </div>
          ) : (
            <Avatar
              src={targetMember?.avatar_url || null}
              name={targetMember?.display_name || effectiveConversation?.name || 'Chat'}
              status={getUserStatus(targetUserId || targetMember?.id)}
              showStatus
              size="sm"
            />
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold text-foreground truncate">
                {isGroup
                  ? effectiveConversation?.name || 'Squad Group'
                  : targetMember?.display_name || 'Squad Chat'}
              </h2>
              {!isGroup && targetMember && (
                <span className="text-[11px] text-muted-foreground/60 font-mono truncate">
                  @{targetMember.username}
                </span>
              )}
            </div>

            <div className="text-[10px] text-muted-foreground/60 truncate">
              {isGroup ? (
                <button
                  onClick={() => setShowGroupSettings(true)}
                  className="hover:text-primary transition-colors flex items-center gap-1"
                >
                  <span>{(effectiveConversation?.members || []).length} squad members</span>
                  <span className="text-primary/70 font-semibold">• Manage Squad</span>
                </button>
              ) : targetMember?.game_activity ? (
                <span className="text-primary font-medium flex items-center gap-1">
                  <Gamepad2 className="w-3 h-3" /> Playing {targetMember.game_activity}
                </span>
              ) : targetMember?.custom_status ? (
                <span>{targetMember.custom_status}</span>
              ) : (
                <span className="capitalize">{getUserStatus(targetUserId || targetMember?.id)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Header Action Controls */}
        <div className="flex items-center gap-1">
          {/* Search Toggle */}
          <button
            onClick={() => setShowSearchInput((prev) => !prev)}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              showSearchInput || searchQuery
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
            )}
            title="Search Messages"
            aria-label="Search Messages"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Pinned Messages Toggle */}
          <button
            onClick={() => setShowPinnedOnly((prev) => !prev)}
            className={cn(
              'p-1.5 rounded-lg transition-colors relative',
              showPinnedOnly
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
            )}
            title="Pinned Messages"
            aria-label="Pinned Messages"
          >
            <Pin className="w-4 h-4" />
            {pinnedCount > 0 && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
            )}
          </button>

          {/* Group Settings Button */}
          {isGroup && (
            <button
              onClick={() => setShowGroupSettings(true)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
              title="Squad Settings & Members"
              aria-label="Squad Settings & Members"
            >
              <Users className="w-4 h-4" />
            </button>
          )}

          {/* Voice & Video Call Controls */}
          {call.activeConversationId === conversationId && call.callStatus === 'in_call' ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-medium text-[11px]">In Voice</span>
              <button
                onClick={() => call.endCall()}
                className="ml-1 px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[10px] font-semibold transition-colors"
                title="Disconnect from Squad Call"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={handleVoiceCallClick}
                className={cn(
                  'p-1.5 rounded-lg transition-colors',
                  isGroup && activeCallSession
                    ? 'text-emerald-400 hover:text-emerald-300 bg-emerald-500/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
                )}
                title={
                  isGroup
                    ? activeCallSession
                      ? 'Join Ongoing Squad Voice Call'
                      : 'Start Squad Voice Call'
                    : 'Start Voice Call'
                }
                aria-label={
                  isGroup
                    ? activeCallSession
                      ? 'Join Ongoing Squad Voice Call'
                      : 'Start Squad Voice Call'
                    : 'Start Voice Call'
                }
              >
                <Phone className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  const peerId = targetUserId || conversationId;
                  call.startCall(peerId, conversationId, true);
                }}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
                title="Start Video Call"
                aria-label="Start Video Call"
              >
                <Video className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Message Search Bar Sub-strip */}
      {showSearchInput && (
        <div className="px-4 py-2 border-b border-border/80 bg-surface-default flex items-center gap-2 animate-in slide-in-from-top-1 duration-150">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            aria-label="Search messages in this chat"
            placeholder="Search words, files, or squadmates in this chat..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label="Clear search query"
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Active Squad Voice Call Banner */}
      {isGroup &&
        isSquadCallActive &&
        (call.activeConversationId !== conversationId || call.callStatus !== 'in_call') && (
          <div className="mx-4 my-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between text-xs animate-in fade-in">
            <div className="flex items-center gap-2 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <Volume2 className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold">Active Squad Voice Call</span>
              <span className="text-muted-foreground hidden sm:inline">
                — squadmates are in voice room
              </span>
            </div>
            <button
              onClick={() => {
                if (call.callStatus === 'incoming_ringing') {
                  call.acceptCall();
                } else {
                  call.startCall(conversationId, conversationId, false);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-sm transition-all"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Join Voice</span>
            </button>
          </div>
        )}

      {/* Pinned Filter Notice Banner */}
      {showPinnedOnly && (
        <div className="px-4 py-2 bg-primary/10 border-b border-primary/20 flex items-center justify-between text-xs text-primary font-medium">
          <div className="flex items-center gap-2">
            <Pin className="w-3.5 h-3.5" />
            <span>Showing pinned messages only ({messages.length})</span>
          </div>
          <button
            onClick={() => setShowPinnedOnly(false)}
            className="text-primary hover:underline font-semibold"
          >
            Show All
          </button>
        </div>
      )}

      {/* Messages Scrollable Stage */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4"
      >
        {/* Empty state when conversation begins */}
        {messages.length === 0 && !isLoading && (
          <div className="p-10 text-center space-y-3">
            <Avatar
              src={targetMember?.avatar_url || null}
              name={targetMember?.display_name || 'Gamer'}
              status={targetMember?.status || 'offline'}
              size="xl"
              className="mx-auto"
            />
            <h3 className="text-lg font-bold text-foreground">
              {targetMember?.display_name || 'Squad Channel'}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              This is the beginning of your direct conversation with{' '}
              <span className="text-foreground font-semibold">@{targetMember?.username || 'member'}</span>.
              Send a message or drag-and-drop game media to begin!
            </p>
          </div>
        )}

        {/* Message List */}
        {messages.map((msg) => {
          const isMe = msg.sender_id === user?.id;
          const isEditing = editingMessageId === msg.id;
          const repliedMsg = msg.reply_to_id
            ? messages.find((m) => m.id === msg.reply_to_id)
            : null;

          return (
            <div
              key={msg.id}
              className={cn(
                'group relative flex gap-3.5 p-2 rounded-xl hover:bg-surface-default/60 transition-colors',
                isMe ? 'flex-row-reverse' : 'flex-row'
              )}
            >
              {/* Sender Avatar */}
              <Avatar
                src={msg.sender?.avatar_url}
                name={msg.sender?.display_name || (isMe ? profile?.display_name : 'Gamer')}
                status={msg.sender?.status || (isMe ? profile?.status || 'online' : 'offline')}
                size="sm"
                className="shrink-0 mt-0.5"
              />

              {/* Message Bubble & Content */}
              <div
                className={cn(
                  'flex flex-col max-w-[85%] sm:max-w-[75%]',
                  isMe ? 'items-end' : 'items-start'
                )}
              >
                {/* Replying Preview quote */}
                {repliedMsg && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80 mb-1 px-2.5 py-0.5 rounded-md bg-surface-panel/50 border-l-2 border-primary">
                    <Reply className="w-3 h-3 rotate-180 text-primary shrink-0" />
                    <span className="font-semibold text-foreground/80">
                      @{repliedMsg.sender?.username || 'user'}:
                    </span>
                    <span className="truncate italic max-w-xs">{repliedMsg.content}</span>
                  </div>
                )}

                {/* Sender Name, Timestamp & Pin indicator */}
                <div className="flex items-center gap-2 mb-1">
                  {msg.is_pinned && (
                    <span title="Pinned">
                      <Pin className="w-3 h-3 text-amber-400 rotate-45 shrink-0" />
                    </span>
                  )}
                  <span className="text-xs font-bold text-foreground">
                    {isMe ? profile?.display_name || 'You' : msg.sender?.display_name || 'Gamer'}
                  </span>
                  <span className="text-[10px] text-muted-foreground/70 font-mono">
                    {formatTimestamp(msg.created_at)}
                  </span>

                  {msg.status === 'sending' && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                      <Loader2 className="w-2.5 h-2.5 animate-spin text-primary" />
                      <span>sending...</span>
                    </span>
                  )}

                  {msg.status === 'failed' && (
                    <span className="flex items-center gap-1.5 text-[10px] text-destructive font-mono">
                      <span>failed</span>
                      <button
                        type="button"
                        onClick={() => retryMessage(msg.id)}
                        className="text-[10px] text-primary underline hover:opacity-80"
                      >
                        Retry
                      </button>
                    </span>
                  )}
                </div>

                {/* Message Text Bubble */}
                {isEditing ? (
                  <div className="flex items-center gap-2 w-full mt-1">
                    <input
                      type="text"
                      aria-label="Edit message content"
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="flex-1 h-9 rounded-lg border border-subtle bg-surface-default px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                      onClick={() => handleSaveEdit(msg.id)}
                      aria-label="Save edited message"
                      className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                      title="Save"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingMessageId(null)}
                      aria-label="Cancel editing"
                      className="p-2 rounded-lg bg-surface-panel text-muted-foreground hover:text-foreground"
                      title="Cancel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  msg.content && (() => {
                    const myUsername = (profile?.username || (user as any)?.username || '').toLowerCase();
                    const isMentioned = !isMe && Boolean(
                      (myUsername && msg.content?.toLowerCase().includes(`@${myUsername}`)) ||
                      msg.content?.toLowerCase().includes('@everyone') ||
                      msg.content?.toLowerCase().includes('@all')
                    );

                    return (
                      <div
                        className={cn(
                          'rounded-2xl px-3.5 py-2 text-xs sm:text-sm leading-relaxed break-words transition-all font-normal',
                          isMe
                            ? 'bg-primary text-primary-foreground rounded-tr-sm shadow-sm'
                            : isMentioned
                            ? 'bg-amber-500/15 border border-amber-500/40 text-foreground rounded-tl-sm ring-1 ring-amber-500/30 shadow-sm'
                            : 'bg-surface-elevated/80 border border-subtle text-foreground rounded-tl-sm'
                        )}
                      >
                        <MessageContent
                          content={msg.content}
                          isMe={isMe}
                          isCallActive={Boolean(isSquadCallActive && msg.id === latestSquadCallMsgId)}
                        />
                        {msg.is_edited && (
                          <span className="text-[10px] opacity-60 ml-1.5 italic">(edited)</span>
                        )}
                      </div>
                    );
                  })()
                )}

                {/* Attachments Section */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mt-2 space-y-2 w-full">
                    {msg.attachments.map((att) => {
                      const isImage = att.file_type.startsWith('image/');
                      const isVideo = att.file_type.startsWith('video/');
                      const isAudio = att.file_type.startsWith('audio/');

                      if (isImage) {
                        return (
                          <div
                            key={att.id}
                            className="relative rounded-xl overflow-hidden border border-border bg-card max-w-sm group/att cursor-pointer"
                            onClick={() => setSelectedMediaModal(att)}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={att.url}
                              alt={att.file_name}
                              className="max-h-64 w-auto object-cover rounded-xl hover:opacity-95 transition-opacity"
                            />
                            <div className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white opacity-0 group-hover/att:opacity-100 transition-opacity">
                              <Maximize2 className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        );
                      }

                      if (isVideo) {
                        return (
                          <div key={att.id} className="rounded-xl overflow-hidden border border-border max-w-md">
                            <video src={att.url} controls className="w-full max-h-72 rounded-xl" />
                          </div>
                        );
                      }

                      if (isAudio) {
                        return (
                          <div key={att.id} className="p-3 rounded-xl bg-card border border-border max-w-sm">
                            <audio src={att.url} controls className="w-full h-8" />
                            <div className="text-[10px] text-muted-foreground mt-1 truncate">
                              {att.file_name}
                            </div>
                          </div>
                        );
                      }

                      // Generic Document / File
                      return (
                        <div
                          key={att.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-card border border-border max-w-xs hover:border-primary/40 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <File className="w-6 h-6 text-primary shrink-0" />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-foreground truncate">
                                {att.file_name}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {formatFileSize(att.file_size)}
                              </div>
                            </div>
                          </div>

                          {att.url && (
                            <a
                              href={att.url}
                              download={att.file_name}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover"
                              title="Download Attachment"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Emoji Reactions Strip */}
                {msg.reactions && msg.reactions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {msg.reactions.map((react) => (
                      <button
                        key={react.emoji}
                        onClick={() => {
                          if (react.has_reacted) {
                            removeReaction(msg.id, react.emoji);
                          } else {
                            addReaction(msg.id, react.emoji);
                          }
                        }}
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-xs transition-colors',
                          react.has_reacted
                            ? 'bg-primary/20 border-primary text-primary font-semibold'
                            : 'bg-card border-border text-foreground/80 hover:bg-surface-hover'
                        )}
                        title={react.users.join(', ')}
                      >
                        <span>{react.emoji}</span>
                        <span className="font-mono text-[10px]">{react.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Hover Quick Action Toolbar */}
              <div
                className={cn(
                  'absolute -top-3 opacity-0 group-hover:opacity-100 transition-opacity bg-surface-elevated/95 backdrop-blur-xl border border-subtle rounded-full shadow-lg flex items-center px-1.5 py-0.5 gap-0.5 z-10',
                  isMe ? 'left-4' : 'right-4'
                )}
              >
                {/* Quick Emoji Reaction Buttons */}
                {['🔥', '🎯', '👍'].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => addReaction(msg.id, emoji)}
                    className="p-1 rounded-full hover:bg-white/[0.08] text-xs transition-colors"
                    title={`React ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}

                <button
                  onClick={() => setReplyingTo(msg)}
                  className="p-1 rounded-full hover:bg-white/[0.08] text-muted-foreground hover:text-foreground transition-colors"
                  title="Reply"
                >
                  <Reply className="w-3 h-3" />
                </button>

                <button
                  onClick={() => togglePinMessage(msg.id, msg.is_pinned)}
                  className={cn(
                    'p-1 rounded-full hover:bg-white/[0.08] transition-colors',
                    msg.is_pinned ? 'text-amber-400' : 'text-muted-foreground hover:text-foreground'
                  )}
                  title={msg.is_pinned ? 'Unpin Message' : 'Pin Message'}
                >
                  <Pin className="w-3 h-3" />
                </button>

                <button
                  onClick={() => setForwardingMessage(msg)}
                  className="p-1 rounded-full hover:bg-white/[0.08] text-muted-foreground hover:text-foreground transition-colors"
                  title="Forward Message"
                >
                  <Forward className="w-3 h-3" />
                </button>

                {!isMe && (
                  <button
                    onClick={() => setReportingMessage(msg)}
                    className="p-1 rounded-full hover:bg-white/[0.08] text-muted-foreground hover:text-rose-400 transition-colors"
                    title="Report Message"
                  >
                    <Flag className="w-3 h-3" />
                  </button>
                )}

                {isMe && (
                  <>
                    <button
                      onClick={() => handleStartEdit(msg)}
                      className="p-1.5 rounded hover:bg-surface-hover text-muted-foreground hover:text-foreground"
                      title="Edit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteMessage(msg.id)}
                      className="p-1.5 rounded hover:bg-rose-500/10 text-muted-foreground hover:text-rose-400"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground italic px-2 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span>{typingUsers.join(', ')} is typing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Selected File Previews Queue Strip */}
      {selectedFiles.length > 0 && (
        <div className="p-3 bg-surface-panel/90 border-t border-border flex items-center gap-3 overflow-x-auto">
          {selectedFiles.map((file, idx) => (
            <div
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className="relative flex items-center gap-2 p-2 rounded-xl bg-card border border-border shrink-0 max-w-xs"
            >
              <File className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground truncate max-w-[120px]">
                  {file.name}
                </div>
                <div className="text-[10px] text-muted-foreground">{formatFileSize(file.size)}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))}
                aria-label={`Remove ${file.name}`}
                title="Remove file"
                className="p-1 rounded-md text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Replying banner */}
      {replyingTo && (
        <div className="px-4 py-2 bg-surface-panel/90 border-t border-border flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 truncate">
            <Reply className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-muted-foreground">Replying to</span>
            <span className="font-semibold text-foreground truncate">
              @{replyingTo.sender?.username || 'user'}
            </span>
            <span className="text-muted-foreground italic truncate max-w-xs">
              &ldquo;{replyingTo.content}&rdquo;
            </span>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            aria-label="Cancel reply"
            className="p-1 rounded-md text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Direct Messaging Privacy Warning Banner */}
      {dmBlockedReason && (
        <div className="mx-4 mb-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-2 text-xs text-amber-300 animate-in fade-in">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>{dmBlockedReason}</span>
        </div>
      )}

      {/* Chat Input Bar */}
      <div className="p-3 sm:p-3.5 border-t border-white/[0.06] bg-surface-header/50">
        <form onSubmit={handleSend} className="relative flex items-center gap-1.5 sm:gap-2">
          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleAddFiles(e.target.files)}
          />

          {/* Attachment button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={Boolean(dmBlockedReason)}
            aria-label="Attach media or file"
            className="p-2 rounded-lg hover:bg-white/[0.04] text-muted-foreground hover:text-foreground transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Attach Media or File (Max 25MB)"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Soundboard Meme Trigger */}
          <button
            type="button"
            onClick={() => setShowSoundboard(true)}
            disabled={Boolean(dmBlockedReason)}
            aria-label="Soundboard meme effects"
            className="p-2 rounded-lg hover:bg-white/[0.04] text-muted-foreground hover:text-amber-400 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Soundboard Meme Effects"
          >
            <Sparkles className="w-4 h-4" />
          </button>

          {/* Text Input */}
          <div className="relative flex-1">
            {/* Mention Autocomplete Floating Dropdown */}
            {mentionCandidates.length > 0 && (
              <div className="absolute bottom-full left-0 mb-2 w-72 max-h-52 overflow-y-auto rounded-xl bg-[#0c0d14]/95 border border-white/[0.12] shadow-2xl backdrop-blur-md p-1.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 flex items-center justify-between border-b border-white/[0.06] mb-1">
                  <span>Mention Squad Members</span>
                  <span className="font-mono text-[9px] opacity-70">↑↓ navigate • ↵ select</span>
                </div>
                <div className="space-y-0.5">
                  {mentionCandidates.map((m, idx) => (
                    <div
                      key={m.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertMention(m.username);
                      }}
                      onMouseEnter={() => setMentionSelectedIndex(idx)}
                      className={cn(
                        "flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors",
                        idx === mentionSelectedIndex
                          ? "bg-primary/20 text-white font-medium"
                          : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                      )}
                    >
                      {m.isSpecial ? (
                        <div className="w-6 h-6 rounded-md bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300 font-bold text-xs shrink-0">
                          @
                        </div>
                      ) : (
                        <Avatar src={m.avatar_url} name={m.display_name} size="sm" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-foreground text-xs truncate">
                            {m.display_name}
                          </span>
                          <span className="text-[10px] text-muted-foreground/60 font-mono truncate">
                            @{m.username}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <input
              ref={inputRef}
              type="text"
              disabled={Boolean(dmBlockedReason)}
              aria-label={`Message @${targetMember?.username || 'squad'}`}
              placeholder={
                dmBlockedReason
                  ? 'Direct messaging disabled by recipient privacy settings'
                  : `Message @${targetMember?.username || 'squad'}...`
              }
              value={inputContent}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full h-10 pl-3.5 pr-10 rounded-xl bg-surface-default/80 border border-white/[0.08] hover:border-white/[0.14] text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/50 transition-colors font-normal disabled:opacity-50 disabled:cursor-not-allowed"
            />

            {/* Quick Emoji Trigger */}
            <button
              type="button"
              onClick={() => setInputContent((prev) => prev + ' 🔥')}
              disabled={Boolean(dmBlockedReason)}
              aria-label="Add fire emoji"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Add Emoji"
            >
              <Smile className="w-4 h-4" />
            </button>
          </div>

          {/* Send Button */}
          <Button
            type="submit"
            size="default"
            aria-label="Send message"
            className="h-10 px-3.5 gap-1.5 shrink-0 rounded-xl font-medium"
            disabled={
              Boolean(dmBlockedReason) ||
              isSending ||
              (!inputContent.trim() && selectedFiles.length === 0)
            }
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>
      </div>

      {/* Full Resolution Media Lightbox Modal */}
      {selectedMediaModal && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setSelectedMediaModal(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between pb-2 text-white text-xs">
              <span className="font-semibold truncate">{selectedMediaModal.file_name}</span>
              <div className="flex items-center gap-2">
                {selectedMediaModal.url && (
                  <a
                    href={selectedMediaModal.url}
                    download={selectedMediaModal.file_name}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg bg-card/80 text-white hover:bg-card"
                    title="Download Media"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                )}
                <button
                  onClick={() => setSelectedMediaModal(null)}
                  className="p-1.5 rounded-lg bg-card/80 text-white hover:bg-card"
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
              className="max-h-[80vh] w-auto rounded-xl object-contain shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* Floating Jump to Latest Button */}
      {isScrolledUp && (
        <button
          onClick={() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            setIsScrolledUp(false);
            isNearBottomRef.current = true;
          }}
          className="absolute bottom-20 right-6 z-30 px-3 py-1.5 rounded-full bg-primary text-black font-semibold text-xs shadow-lg flex items-center gap-1.5 hover:brightness-110 transition animate-in fade-in"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          <span>Jump to latest</span>
        </button>
      )}

      {/* Soundboard Modal */}
      <SoundboardModal open={showSoundboard} onOpenChange={setShowSoundboard} />

      {/* Group DM Settings Modal */}
      <GroupSettingsModal
        conversation={effectiveConversation}
        open={showGroupSettings}
        onOpenChange={setShowGroupSettings}
        onLeftGroup={() => onBack?.()}
      />

      {/* Forward Message Modal */}
      <ForwardModal
        message={forwardingMessage}
        open={Boolean(forwardingMessage)}
        onOpenChange={(op) => !op && setForwardingMessage(null)}
      />

      {/* Report Modal */}
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
