'use client';

import * as React from 'react';
import {
  Reply,
  Edit2,
  Trash2,
  Pin,
  Forward,
  Flag,
  File,
  Download,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { ProfileCardTrigger } from '@/components/profile/ProfileCardTrigger';
import { Message, MessageAttachment } from '@/lib/types/messaging';
import { MessageContent } from '@/components/chat/message-content';
import { formatFileSize } from '@/lib/storage/upload';
import { cn } from '@/lib/utils';

const COMMON_EMOJIS = ['🔥', '👍', '❤️', '😂', '🎯', '🚀'];

interface ChatMessageRowProps {
  message: Message;
  currentUserId?: string;
  isGrouped?: boolean;
  isNewUnreadDivider?: boolean;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (messageId: string) => void;
  onTogglePin: (messageId: string) => void;
  onForward: (message: Message) => void;
  onReport: (message: Message) => void;
  onReactionAdd: (messageId: string, emoji: string) => void;
  onReactionRemove: (messageId: string, emoji: string) => void;
  onRetry: (message: Message) => void;
  onSelectMedia: (attachment: MessageAttachment) => void;
}

function ChatMessageRowComponent({
  message,
  currentUserId,
  isGrouped = false,
  isNewUnreadDivider = false,
  onReply,
  onEdit,
  onDelete,
  onTogglePin,
  onForward,
  onReport,
  onReactionAdd,
  onReactionRemove,
  onRetry,
  onSelectMedia,
}: ChatMessageRowProps) {
  const isMe = message.sender_id === currentUserId;
  const isFailed = message.status === 'failed';
  const isSending = message.status === 'sending';
  const isPinned = message.is_pinned;

  const timeString = React.useMemo(() => {
    try {
      const d = new Date(message.created_at);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }, [message.created_at]);

  // Reactions directly from typed message
  const reactions = message.reactions || [];

  return (
    <div className="relative group/row">
      {/* Accent New Messages Divider */}
      {isNewUnreadDivider && (
        <div className="my-3 flex items-center gap-3 px-4 select-none">
          <div className="h-px bg-primary/40 flex-1" />
          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-meta font-medium">
            New Messages
          </span>
          <div className="h-px bg-primary/40 flex-1" />
        </div>
      )}

      {/* Message Row */}
      <div
        className={cn(
          'relative flex gap-3 px-4 transition-colors duration-fast ease-pro hover:bg-surface-hover/50',
          isGrouped ? 'py-0.5' : 'pt-3 pb-0.5',
          isPinned && 'bg-primary-subtle/30',
          isFailed && 'bg-danger/10'
        )}
      >
        {/* Left Gutter: Avatar or Compact Hover Timestamp */}
        <div className="w-8 shrink-0 flex items-start justify-center pt-0.5 select-none">
          {isGrouped ? (
            <span className="text-meta text-muted-foreground tabular-nums opacity-0 group-hover/row:opacity-100 transition-opacity">
              {timeString}
            </span>
          ) : (
            <ProfileCardTrigger userId={message.sender?.id || message.sender_id}>
              <Avatar
                src={(message.sender as any)?.avatar_path || message.sender?.avatar_url}
                name={message.sender?.display_name || 'User'}
                size="32"
                avatarColor={message.sender?.avatar_color}
                className="cursor-pointer hover:opacity-90 transition-opacity"
              />
            </ProfileCardTrigger>
          )}
        </div>

        {/* Message Content */}
        <div className="min-w-0 flex-1">
          {/* Header Line (Only if not grouped) */}
          {!isGrouped && (
            <div className="flex items-baseline gap-2 mb-1 select-none">
              <ProfileCardTrigger userId={message.sender?.id || message.sender_id}>
                <span className="text-body font-semibold text-foreground truncate hover:underline cursor-pointer">
                  {message.sender?.display_name || 'User'}
                </span>
              </ProfileCardTrigger>
              <span className="text-meta text-muted-foreground">
                @{message.sender?.username || 'user'}
              </span>
              <span className="text-meta text-muted-foreground tabular-nums">
                {timeString}
              </span>
              {message.is_edited && (
                <span className="text-meta text-muted-foreground italic">(edited)</span>
              )}
              {isPinned && (
                <span className="inline-flex items-center gap-1 text-meta font-medium text-primary">
                  <Pin className="w-3 h-3" /> Pinned
                </span>
              )}
            </div>
          )}

          {/* Compact Reply Quote */}
          {message.reply_to && !isGrouped && (
            <div className="mb-1 flex items-center gap-1.5 text-meta text-muted-foreground bg-surface-hover/40 px-2 py-0.5 rounded-control border-l-2 border-primary max-w-xl truncate">
              <Reply className="w-3 h-3 text-primary shrink-0" />
              <span className="font-medium text-foreground">
                @{message.reply_to.sender?.username || 'user'}:
              </span>
              <span className="truncate italic">
                {message.reply_to.content}
              </span>
            </div>
          )}

          {/* Body Text */}
          <div className="text-body leading-5 text-foreground select-text break-words">
            <MessageContent content={message.content} isMe={isMe} />
          </div>

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {message.attachments.map((att) => {
                const isImage = att.file_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.file_name);
                const isVideo = att.file_type?.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(att.file_name);
                const isAudio = att.file_type?.startsWith('audio/') || /\.(mp3|wav|ogg)$/i.test(att.file_name);

                if (isImage && att.url) {
                  return (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => onSelectMedia(att)}
                      className="rounded-card overflow-hidden border border-border hover:border-primary transition-colors max-w-sm"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={att.url}
                        alt={att.file_name}
                        className="max-h-64 w-auto object-cover rounded-card"
                        loading="lazy"
                        decoding="async"
                      />
                    </button>
                  );
                }

                if (isVideo && att.url) {
                  return (
                    <video
                      key={att.id}
                      src={att.url}
                      controls
                      className="max-h-64 max-w-sm rounded-card border border-border bg-black"
                    />
                  );
                }

                if (isAudio && att.url) {
                  return (
                    <audio
                      key={att.id}
                      src={att.url}
                      controls
                      className="w-full max-w-sm rounded-control"
                    />
                  );
                }

                return (
                  <div
                    key={att.id}
                    className="flex items-center gap-2.5 p-2.5 rounded-card bg-surface-sidebar border border-border max-w-xs"
                  >
                    <File className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-foreground truncate">
                        {att.file_name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatFileSize(att.file_size)}
                      </div>
                    </div>
                    {att.url && (
                      <a
                        href={att.url}
                        download={att.file_name}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 rounded-control text-muted-foreground hover:text-foreground transition-colors"
                        title="Download file"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Reactions Strip */}
          {reactions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {reactions.map((rec) => {
                const hasReacted = rec.has_reacted;
                return (
                  <button
                    type="button"
                    key={rec.emoji}
                    onClick={() => {
                      if (hasReacted) {
                        onReactionRemove(message.id, rec.emoji);
                      } else {
                        onReactionAdd(message.id, rec.emoji);
                      }
                    }}
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors',
                      hasReacted
                        ? 'bg-primary-subtle border-primary text-primary font-medium'
                        : 'bg-surface-sidebar border-border text-foreground hover:bg-surface-hover'
                    )}
                  >
                    <span>{rec.emoji}</span>
                    <span className="text-meta font-semibold tabular-nums">{rec.count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Failed Message State */}
          {isFailed && (
            <div className="mt-1 flex items-center gap-2 text-xs text-danger">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Not sent</span>
              <button
                type="button"
                onClick={() => onRetry(message)}
                className="underline hover:text-danger/80 inline-flex items-center gap-1 font-medium"
              >
                <RotateCcw className="w-3 h-3" /> Retry
              </button>
              <span>or</span>
              <button
                type="button"
                onClick={() => onDelete(message.id)}
                className="underline hover:text-danger/80 font-medium"
              >
                Delete
              </button>
            </div>
          )}
        </div>

        {/* Hover Action Toolbar (Desktop) */}
        {!isFailed && !isSending && (
          <div className="absolute right-4 -top-3 hidden group-hover/row:flex items-center gap-0.5 rounded-control bg-card border border-border shadow-dialog p-0.5 z-20">
            {/* Quick Reactions */}
            {COMMON_EMOJIS.slice(0, 3).map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onReactionAdd(message.id, emoji)}
                className="p-1 rounded-control hover:bg-surface-hover text-xs transition-colors"
                title={`React ${emoji}`}
              >
                {emoji}
              </button>
            ))}

            <div className="w-px h-3.5 bg-border mx-0.5" />

            <button
              type="button"
              onClick={() => onReply(message)}
              className="p-1 rounded-control hover:bg-surface-hover text-muted-foreground hover:text-foreground transition-colors"
              title="Reply"
              aria-label="Reply"
            >
              <Reply className="w-3.5 h-3.5" />
            </button>

            {isMe && (
              <button
                type="button"
                onClick={() => onEdit(message)}
                className="p-1 rounded-control hover:bg-surface-hover text-muted-foreground hover:text-foreground transition-colors"
                title="Edit message"
                aria-label="Edit message"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => onTogglePin(message.id)}
              className={cn(
                'p-1 rounded-control hover:bg-surface-hover transition-colors',
                isPinned ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
              title={isPinned ? 'Unpin message' : 'Pin message'}
              aria-label={isPinned ? 'Unpin message' : 'Pin message'}
            >
              <Pin className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onForward(message)}
              className="p-1 rounded-control hover:bg-surface-hover text-muted-foreground hover:text-foreground transition-colors"
              title="Forward message"
              aria-label="Forward message"
            >
              <Forward className="w-3.5 h-3.5" />
            </button>

            {isMe ? (
              <button
                type="button"
                onClick={() => onDelete(message.id)}
                className="p-1 rounded-control hover:bg-danger/10 text-muted-foreground hover:text-danger transition-colors"
                title="Delete message"
                aria-label="Delete message"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onReport(message)}
                className="p-1 rounded-control hover:bg-surface-hover text-muted-foreground hover:text-foreground transition-colors"
                title="Report message"
                aria-label="Report message"
              >
                <Flag className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const ChatMessageRow = React.memo(ChatMessageRowComponent);
