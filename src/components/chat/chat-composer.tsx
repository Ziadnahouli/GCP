'use client';

import * as React from 'react';
import {
  Send,
  Paperclip,
  Smile,
  Sparkles,
  X,
  File,
  Reply,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Message, MessageAttachment } from '@/lib/types/messaging';
import { formatFileSize, validateFile } from '@/lib/storage/upload';
import { cn } from '@/lib/utils';

const MAX_CHAR_LIMIT = 4000;
const CHAR_WARNING_THRESHOLD = 3600;

interface ChatComposerProps {
  conversationId: string;
  placeholder?: string;
  disabledReason?: string | null;
  replyingTo: Message | null;
  onCancelReply: () => void;
  onSendMessage: (content: string, files: File[]) => Promise<void>;
  onSendTyping: () => void;
  onOpenSoundboard: () => void;
  mentionCandidates?: Array<{
    id: string;
    username: string;
    display_name: string;
    avatar_url?: string | null;
    isSpecial?: boolean;
  }>;
  onSelectMention?: (username: string) => void;
}

export function ChatComposer({
  conversationId,
  placeholder,
  disabledReason,
  replyingTo,
  onCancelReply,
  onSendMessage,
  onSendTyping,
  onOpenSoundboard,
  mentionCandidates = [],
  onSelectMention,
}: ChatComposerProps) {
  const [content, setContent] = React.useState('');
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
  const [isSending, setIsSending] = React.useState(false);
  const [mentionIndex, setMentionIndex] = React.useState(0);
  const [cursorPos, setCursorPos] = React.useState(0);
  const [mentionDismissed, setMentionDismissed] = React.useState(false);
  const [isFocused, setIsFocused] = React.useState(false);

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Restore saved draft
  React.useEffect(() => {
    if (typeof window !== 'undefined' && conversationId) {
      const draft = localStorage.getItem(`nexus_draft_conv_${conversationId}`);
      if (draft) {
        setContent(draft);
        setCursorPos(draft.length);
      } else {
        setContent('');
        setCursorPos(0);
      }
    }
  }, [conversationId]);

  // Persist draft
  React.useEffect(() => {
    if (typeof window !== 'undefined' && conversationId) {
      if (content.trim()) {
        localStorage.setItem(`nexus_draft_conv_${conversationId}`, content);
      } else {
        localStorage.removeItem(`nexus_draft_conv_${conversationId}`);
      }
    }
  }, [content, conversationId]);

  // Ensure composer stays above the mobile keyboard
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const handleViewportChange = () => {
      if (document.activeElement === textareaRef.current) {
        textareaRef.current?.scrollIntoView({ block: 'nearest' });
      }
    };
    const vp = window.visualViewport;
    vp.addEventListener('resize', handleViewportChange);
    vp.addEventListener('scroll', handleViewportChange);
    return () => {
      vp.removeEventListener('resize', handleViewportChange);
      vp.removeEventListener('scroll', handleViewportChange);
    };
  }, []);

  // Auto-resize textarea height
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [content]);

  // Active mention matching based on text immediately before cursor (e.g. "hi @al" -> "al")
  const activeMentionMatch = React.useMemo(() => {
    if (mentionDismissed || !isFocused) return null;
    const textBeforeCursor = content.slice(0, cursorPos);
    const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_\-\.]*)$/);
    if (!match) return null;
    return match[1].toLowerCase();
  }, [content, cursorPos, mentionDismissed, isFocused]);

  const filteredMentionCandidates = React.useMemo(() => {
    if (activeMentionMatch === null || mentionCandidates.length === 0) return [];
    return mentionCandidates.filter(
      (m) =>
        m.username.toLowerCase().includes(activeMentionMatch) ||
        m.display_name.toLowerCase().includes(activeMentionMatch)
    );
  }, [activeMentionMatch, mentionCandidates]);

  const showMentions = isFocused && !mentionDismissed && filteredMentionCandidates.length > 0;

  React.useEffect(() => {
    setMentionIndex(0);
  }, [activeMentionMatch]);

  const handleSelectMentionCandidate = React.useCallback(
    (username: string) => {
      const textBeforeCursor = content.slice(0, cursorPos);
      const textAfterCursor = content.slice(cursorPos);
      const replacedBefore = textBeforeCursor.replace(/(?:^|\s)@([a-zA-Z0-9_\-\.]*)$/, (m) => {
        const leading = m.startsWith(' ') ? ' ' : '';
        return `${leading}@${username} `;
      });
      const newContent = replacedBefore + textAfterCursor;
      setContent(newContent);
      setMentionDismissed(true);
      if (onSelectMention) {
        onSelectMention(username);
      }
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newPos = replacedBefore.length;
          textareaRef.current.setSelectionRange(newPos, newPos);
          setCursorPos(newPos);
        }
      }, 0);
    },
    [content, cursorPos, onSelectMention]
  );

  const handleAddFiles = (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    const newFiles: File[] = [];
    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      const valid = validateFile(file);
      if (valid.valid) {
        newFiles.push(file);
      }
    }
    if (newFiles.length > 0) {
      setSelectedFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      e.preventDefault();
      handleAddFiles(e.clipboardData.files);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSending || Boolean(disabledReason)) return;
    const trimmed = content.trim();
    if (!trimmed && selectedFiles.length === 0) return;

    setIsSending(true);
    try {
      await onSendMessage(trimmed, selectedFiles);
      setContent('');
      setSelectedFiles([]);
      setCursorPos(0);
      setMentionDismissed(false);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(`nexus_draft_conv_${conversationId}`);
      }
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % filteredMentionCandidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + filteredMentionCandidates.length) % filteredMentionCandidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const cand = filteredMentionCandidates[mentionIndex];
        if (cand) {
          handleSelectMentionCandidate(cand.username);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionDismissed(true);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
      return;
    }

    if (e.key === 'Escape' && replyingTo) {
      e.preventDefault();
      onCancelReply();
      return;
    }

    onSendTyping();
  };

  const isOverThreshold = content.length >= CHAR_WARNING_THRESHOLD;
  const isOverLimit = content.length > MAX_CHAR_LIMIT;

  return (
    <div className="border-t border-border bg-background select-none pb-safe">
      {/* File Previews Strip */}
      {selectedFiles.length > 0 && (
        <div className="p-2.5 bg-surface-sidebar border-b border-border flex items-center gap-2 overflow-x-auto">
          {selectedFiles.map((file, idx) => (
            <div
              key={`${file.name}-${idx}`}
              className="flex items-center gap-2 p-1.5 px-2.5 rounded-control bg-card border border-border shrink-0 max-w-xs text-xs"
            >
              <File className="w-3.5 h-3.5 text-primary shrink-0" />
              <div className="min-w-0 truncate max-w-[120px]">
                <div className="font-medium text-foreground truncate">{file.name}</div>
                <div className="text-xs text-muted-foreground">{formatFileSize(file.size)}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))}
                aria-label={`Remove ${file.name}`}
                className="p-1 rounded-control text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Replying Banner */}
      {replyingTo && (
        <div className="px-4 py-1.5 bg-surface-sidebar border-b border-border flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 truncate">
            <Reply className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-muted-foreground">Replying to</span>
            <span className="font-semibold text-foreground truncate">
              @{replyingTo.sender?.username || 'user'}
            </span>
            <span className="text-muted-foreground truncate max-w-xs italic">
              &ldquo;{replyingTo.content}&rdquo;
            </span>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="p-1 rounded-control text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Disabled Privacy / State Warning */}
      {disabledReason && (
        <div className="mx-3 my-2 p-2.5 rounded-card bg-warning/10 border border-warning/25 flex items-center gap-2 text-xs text-warning">
          <AlertTriangle className="w-4 h-4 shrink-0 text-warning" />
          <span>{disabledReason}</span>
        </div>
      )}

      {/* Composer Input Area */}
      <div className="p-3">
        <div className="relative rounded-card border border-border bg-card focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 transition-all">
          {/* Mention Candidates Autocomplete */}
          {showMentions && (
            <div className="absolute bottom-full left-0 mb-2 w-72 max-h-52 overflow-y-auto rounded-card bg-popover border border-border shadow-popover p-1 z-dropdown">
              <div className="px-2 py-1 text-meta font-medium text-muted-foreground border-b border-border mb-1">
                Mention members
              </div>
              <div className="space-y-0.5">
                {filteredMentionCandidates.map((m, idx) => (
                  <button
                    type="button"
                    key={m.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectMentionCandidate(m.username);
                    }}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-control text-meta text-left transition-colors',
                      idx === mentionIndex ? 'bg-surface-hover text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {m.isSpecial ? (
                      <div className="w-5 h-5 rounded bg-warning/20 text-warning font-bold flex items-center justify-center text-meta">
                        @
                      </div>
                    ) : (
                      <Avatar src={m.avatar_url} name={m.display_name} size="20" />
                    )}
                    <span className="font-medium text-foreground truncate">{m.display_name}</span>
                    <span className="text-muted-foreground truncate">@{m.username}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleAddFiles(e.target.files)}
          />

          <textarea
            ref={textareaRef}
            rows={1}
            disabled={Boolean(disabledReason)}
            placeholder={disabledReason ? disabledReason : (placeholder || 'Type a message...')}
            value={content}
            onFocus={() => {
              setIsFocused(true);
              setMentionDismissed(false);
            }}
            onBlur={() => {
              setTimeout(() => setIsFocused(false), 200);
            }}
            onChange={(e) => {
              setContent(e.target.value);
              setCursorPos(e.target.selectionStart || 0);
              setMentionDismissed(false);
            }}
            onClick={(e) => {
              setCursorPos((e.target as HTMLTextAreaElement).selectionStart || 0);
            }}
            onKeyUp={(e) => {
              setCursorPos((e.target as HTMLTextAreaElement).selectionStart || 0);
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            className="w-full bg-transparent px-3 py-2 text-body max-sm:text-md text-foreground placeholder:text-muted-foreground outline-none resize-none min-h-[36px] max-h-[180px] leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed select-text"
          />

          {/* Bottom Toolbar: Attachments, Emoji, Soundboard, Character Counter, Send */}
          <div className="flex items-center justify-between px-2 py-1.5 border-t border-border/50 text-xs">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={Boolean(disabledReason)}
                className="p-1.5 rounded-control text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors disabled:opacity-40"
                title="Attach file (Max 25MB)"
                aria-label="Attach file"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onOpenSoundboard}
                disabled={Boolean(disabledReason)}
                className="p-1.5 rounded-control text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors disabled:opacity-40"
                title="Soundboard"
                aria-label="Soundboard"
              >
                <Sparkles className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setContent((prev) => prev + ' 👍')}
                disabled={Boolean(disabledReason)}
                className="p-1.5 rounded-control text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors disabled:opacity-40"
                title="Add emoji"
                aria-label="Add emoji"
              >
                <Smile className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {/* Character Counter (Appears at >= 90% of limit) */}
              {isOverThreshold && (
                <span
                  className={cn(
                    'text-meta font-medium tabular-nums',
                    isOverLimit ? 'text-danger font-bold' : 'text-muted-foreground'
                  )}
                >
                  {MAX_CHAR_LIMIT - content.length}
                </span>
              )}

              <Button
                type="button"
                size="sm"
                onClick={() => handleSubmit()}
                disabled={
                  Boolean(disabledReason) ||
                  isSending ||
                  isOverLimit ||
                  (!content.trim() && selectedFiles.length === 0)
                }
                isLoading={isSending}
                className="h-7 px-2.5 gap-1.5 text-body font-medium"
                aria-label="Send message"
              >
                <span>Send</span>
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
