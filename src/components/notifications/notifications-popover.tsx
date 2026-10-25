'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  X,
  MessageSquare,
  Phone,
  PhoneMissed,
  UserPlus,
  Sparkles,
  Shield,
  Clock,
  ExternalLink,
  Reply,
  Radio,
} from 'lucide-react';
import { NotificationItem } from '@/hooks/use-notifications';
import { useModalEscape } from '@/hooks/use-modal-escape';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface NotificationsPopoverProps {
  open: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  unreadCount: number;
  onMarkAsRead: (id: string) => Promise<void>;
  onMarkAllAsRead: () => Promise<void>;
  onDeleteNotification: (id: string) => Promise<void>;
  onClearAll: () => Promise<void>;
}

function formatRelativeTime(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(isoString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return 'Recently';
  }
}

function getNotificationIcon(type: NotificationItem['type']) {
  switch (type) {
    case 'friend_request':
      return <UserPlus className="w-3.5 h-3.5 text-success" />;
    case 'mention':
      return <Sparkles className="w-3.5 h-3.5 text-primary" />;
    case 'message':
      return <MessageSquare className="w-3.5 h-3.5 text-primary" />;
    case 'reply':
      return <Reply className="w-3.5 h-3.5 text-primary" />;
    case 'server_invitation':
      return <Radio className="w-3.5 h-3.5 text-warning" />;
    case 'missed_call':
      return <PhoneMissed className="w-3.5 h-3.5 text-danger" />;
    case 'call':
      return <Phone className="w-3.5 h-3.5 text-primary" />;
    case 'system':
    default:
      return <Shield className="w-3.5 h-3.5 text-warning" />;
  }
}

export function NotificationsPopover({
  open,
  onClose,
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onDeleteNotification,
  onClearAll,
}: NotificationsPopoverProps) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<'all' | 'unread'>('all');
  const popoverRef = React.useRef<HTMLDivElement>(null);

  useModalEscape(open, (isOpen) => {
    if (!isOpen) onClose();
  });

  // Close on click outside
  React.useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, onClose]);

  if (!open) return null;

  const displayList = filter === 'unread' ? notifications.filter((n) => !n.is_read) : notifications;

  const handleItemClick = async (item: NotificationItem) => {
    if (!item.is_read) {
      await onMarkAsRead(item.id);
    }

    if (item.data?.conversation_id) {
      router.push(`/?c=${item.data.conversation_id}`);
      onClose();
    } else if (item.data?.server_id && item.data?.channel_id) {
      router.push(`/?s=${item.data.server_id}&ch=${item.data.channel_id}`);
      onClose();
    } else if (item.data?.url) {
      router.push(item.data.url);
      onClose();
    } else if (item.type === 'friend_request') {
      router.push('/');
      onClose();
    }
  };

  const renderNotificationItem = (item: NotificationItem) => (
    <div
      key={item.id}
      onClick={() => handleItemClick(item)}
      className={cn(
        'group relative flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer text-left',
        item.is_read
          ? 'bg-surface-default border-border hover:bg-surface-hover text-muted-foreground'
          : 'bg-primary/5 border-primary/20 hover:bg-primary/10 text-foreground'
      )}
    >
      {/* Type Icon Badge */}
      <div className="w-7 h-7 rounded-lg bg-surface-default border border-border flex items-center justify-center shrink-0 mt-0.5">
        {getNotificationIcon(item.type)}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <div className={cn('text-xs font-semibold truncate', !item.is_read && 'text-foreground font-bold')}>
            {item.title}
          </div>
          <span className="text-xs text-muted-foreground/50 font-mono shrink-0">
            {formatRelativeTime(item.created_at)}
          </span>
        </div>
        <div className="text-xs text-muted-foreground/80 line-clamp-2 mt-0.5 leading-snug">
          {item.message}
        </div>
      </div>

      {/* Actions & Read dot */}
      <div className="flex items-center gap-1 shrink-0 self-center">
        {!item.is_read && (
          <span className="w-2 h-2 rounded-full bg-primary shrink-0" title="Unread" />
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteNotification(item.id);
          }}
          className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-danger hover:bg-danger/10 rounded-md transition-all"
          title="Delete notification"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );

  return (
    <div
      ref={popoverRef}
      className="absolute right-2 sm:right-4 top-12 z-50 w-[340px] sm:w-[380px] max-h-[500px] flex flex-col rounded-2xl bg-card border border-border shadow-2xl shadow-black/90 text-foreground overflow-hidden animate-in fade-in zoom-in-95 duration-150 select-none"
    >
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between bg-surface-header/90">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold text-foreground">Notifications</span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-xs font-mono font-bold bg-primary text-primary-foreground">
              {unreadCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={() => onMarkAllAsRead()}
              className="px-2 py-1 text-xs font-medium text-primary hover:text-primary/80 hover:bg-primary/10 rounded-lg transition-colors flex items-center gap-1"
              title="Mark all as read"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Mark all read</span>
            </button>
          )}

          {notifications.length > 0 && (
            <button
              onClick={() => onClearAll()}
              className="p-1 text-muted-foreground hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
              title="Clear all notifications"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-surface-default rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-3 py-1.5 border-b border-border flex items-center gap-1 bg-surface-default">
        <button
          onClick={() => setFilter('all')}
          className={cn(
            'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
            filter === 'all'
              ? 'bg-surface-hover text-foreground font-semibold'
              : 'text-muted-foreground hover:text-foreground hover:bg-surface-default'
          )}
        >
          All ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={cn(
            'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
            filter === 'unread'
              ? 'bg-surface-hover text-foreground font-semibold'
              : 'text-muted-foreground hover:text-foreground hover:bg-surface-default'
          )}
        >
          Unread ({unreadCount})
        </button>
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1 p-2 space-y-1.5 max-h-[380px] no-scrollbar">
        {displayList.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <div className="w-10 h-10 rounded-2xl bg-surface-default border border-border flex items-center justify-center mx-auto text-muted-foreground/60">
              <Check className="w-5 h-5 text-success" />
            </div>
            <div className="text-xs font-medium text-foreground">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </div>
            <div className="text-xs text-muted-foreground/60 leading-relaxed max-w-[240px] mx-auto">
              {filter === 'unread'
                ? "You're all caught up with your squad alerts and messages."
                : 'Direct messages, mentions, and squad invites will appear here.'}
            </div>
          </div>
        ) : (
          <>
            {/* Today Group */}
            {displayList.some((item) => {
              const d = new Date(item.created_at);
              const now = new Date();
              return d.toDateString() === now.toDateString();
            }) && (
              <div className="space-y-1">
                <div className="px-2 py-0.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
                  Today
                </div>
                {displayList
                  .filter((item) => {
                    const d = new Date(item.created_at);
                    const now = new Date();
                    return d.toDateString() === now.toDateString();
                  })
                  .map((item) => renderNotificationItem(item))}
              </div>
            )}

            {/* Earlier Group */}
            {displayList.some((item) => {
              const d = new Date(item.created_at);
              const now = new Date();
              return d.toDateString() !== now.toDateString();
            }) && (
              <div className="space-y-1 pt-1">
                <div className="px-2 py-0.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
                  Earlier
                </div>
                {displayList
                  .filter((item) => {
                    const d = new Date(item.created_at);
                    const now = new Date();
                    return d.toDateString() !== now.toDateString();
                  })
                  .map((item) => renderNotificationItem(item))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
