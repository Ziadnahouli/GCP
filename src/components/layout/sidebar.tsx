'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Gamepad2,
  Users,
  MessageSquare,
  Compass,
  Radio,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAuth } from '@/features/auth/auth-provider';
import { usePresence } from '@/features/presence/presence-context';
import { useConversations } from '@/hooks/use-conversations';
import { useServers } from '@/hooks/use-servers';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

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
  const { getUserStatus } = usePresence();
  const { conversations } = useConversations();
  const { servers } = useServers();

  return (
    <aside
      className={cn(
        'h-full bg-surface-sidebar border-r border-white/[0.06] flex flex-col justify-between transition-all duration-150 select-none shrink-0 z-20',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Top Header / App Brand */}
      <div className="overflow-y-auto flex-1 no-scrollbar">
        <div className="h-12 border-b border-white/[0.06] flex items-center justify-between px-3 sticky top-0 bg-surface-sidebar/95 backdrop-blur-md z-10">
          <Link
            href="/"
            onClick={() => onSelectConversation?.(null)}
            className="flex items-center gap-2.5 group"
          >
            <div className="w-6 h-6 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
              <Gamepad2 className="w-3.5 h-3.5" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="font-bold tracking-tight text-xs text-foreground">
                  Nexus
                </span>
                <span className="text-[9px] text-muted-foreground/60 font-mono -mt-0.5">
                  Platform
                </span>
              </div>
            )}
          </Link>

          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-white/[0.04] transition-colors"
              title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
              aria-label="Toggle Sidebar"
            >
              {collapsed ? (
                <PanelLeftOpen className="w-3.5 h-3.5" />
              ) : (
                <PanelLeftClose className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>

        {/* Primary Social Hub Item */}
        <div className="p-2 space-y-0.5 mt-0.5">
          <button
            onClick={() => onSelectConversation?.(null)}
            className={cn(
              'w-full flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors group relative text-left',
              !selectedConversationId && pathname === '/'
                ? 'bg-white/[0.06] text-foreground font-semibold'
                : 'text-muted-foreground hover:bg-white/[0.03] hover:text-foreground',
              collapsed ? 'justify-center' : 'justify-between'
            )}
            title={collapsed ? 'Friends & Social' : undefined}
          >
            <div className="flex items-center gap-2.5">
              <Users
                className={cn(
                  'w-4 h-4 shrink-0 transition-colors',
                  !selectedConversationId ? 'text-primary' : 'text-muted-foreground'
                )}
              />
              {!collapsed && <span>Friends & Social</span>}
            </div>

            {!collapsed && (
              <span className="text-[10px] text-muted-foreground/50 font-mono">
                Hub
              </span>
            )}

            {!selectedConversationId && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-primary rounded-r" />
            )}
          </button>
        </div>

        {/* Direct Messages Section */}
        <div className="p-2 mt-0.5">
          {!collapsed && (
            <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              <span>Direct Messages</span>
              <button
                onClick={() => router.push('/')}
                className="text-muted-foreground/60 hover:text-primary transition-colors p-0.5 rounded"
                title="Start a Direct Message"
                aria-label="Start Direct Message"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          )}

          <div className="space-y-0.5 mt-1">
            {conversations.length === 0 ? (
              !collapsed && (
                <div className="p-2.5 text-center rounded-lg border border-dashed border-white/[0.08] bg-surface-default/30 space-y-1.5 mt-1">
                  <p className="text-[11px] text-muted-foreground/70">No active chats</p>
                  <button
                    onClick={() => router.push('/')}
                    className="w-full py-1 px-2 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-foreground text-xs font-medium transition-colors"
                  >
                    Start a Chat
                  </button>
                </div>
              )
            ) : (
              conversations.map((conv) => {
                const otherMemberRow = conv.members.find((m) => m.user_id !== user?.id);
                const otherMember = otherMemberRow?.profile || null;
                const otherMemberId = otherMemberRow?.user_id || otherMember?.id;
                const isSelected = selectedConversationId === conv.id;
                const title = otherMember?.display_name || conv.name || 'Chat';

                return (
                  <div
                    key={conv.id}
                    onClick={() => onSelectConversation?.(conv.id)}
                    className={cn(
                      'flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors group relative',
                      isSelected
                        ? 'bg-white/[0.06] text-foreground font-semibold'
                        : 'hover:bg-white/[0.03] text-muted-foreground hover:text-foreground',
                      collapsed ? 'justify-center' : ''
                    )}
                    title={title}
                  >
                    <Avatar
                      src={otherMember?.avatar_url}
                      name={title}
                      status={getUserStatus(otherMemberId)}
                      showStatus
                      size="sm"
                    />

                    {!collapsed && (
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-foreground group-hover:text-primary transition-colors text-xs font-medium">
                          {title}
                        </div>
                        {conv.last_message && (
                          <div className="text-[10px] text-muted-foreground/60 truncate leading-tight mt-0.5">
                            {conv.last_message.content}
                          </div>
                        )}
                      </div>
                    )}

                    {isSelected && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-primary rounded-r" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Servers / Squads List Preview */}
        <div className="p-2 mt-0.5">
          {!collapsed && (
            <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              <span>Servers & Squads</span>
            </div>
          )}

          <div className="space-y-0.5 mt-1">
            {servers.map((server) => {
              const tag = server.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 3)
                .toUpperCase();
              return (
                <div
                  key={server.id}
                  onClick={() =>
                    router.push(
                      `/?s=${server.id}&ch=${server.channels?.[0]?.id || `default-chan-${server.id}`}`
                    )
                  }
                  className={cn(
                    'flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors hover:bg-white/[0.03] group',
                    collapsed ? 'justify-center' : ''
                  )}
                  title={server.name}
                >
                  <div className="w-5 h-5 rounded-md bg-white/[0.05] border border-white/[0.08] flex items-center justify-center font-bold text-[9px] text-muted-foreground shrink-0 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary/40 transition-colors">
                    {tag}
                  </div>
                  {!collapsed && (
                    <span className="truncate text-foreground group-hover:text-primary transition-colors font-normal">
                      {server.name}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom section app version */}
      {!collapsed && (
        <div className="p-2 border-t border-white/[0.06] text-[9px] text-muted-foreground/40 font-mono text-center">
          Nexus • v1.0
        </div>
      )}
    </aside>
  );
}
