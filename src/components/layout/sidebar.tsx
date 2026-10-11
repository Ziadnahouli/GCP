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
  const { conversations } = useConversations();
  const { servers } = useServers();

  return (
    <aside
      className={cn(
        'h-full bg-surface-sidebar border-r border-border flex flex-col justify-between transition-all duration-200 select-none shrink-0 z-20',
        collapsed ? 'w-18' : 'w-60'
      )}
    >
      {/* Top Header / App Brand */}
      <div className="overflow-y-auto flex-1">
        <div className="h-14 border-b border-border/80 flex items-center justify-between px-3.5 sticky top-0 bg-surface-sidebar z-10">
          <Link
            href="/"
            onClick={() => onSelectConversation?.(null)}
            className="flex items-center gap-2.5 group"
          >
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-black shadow-glow-sm group-hover:scale-105 transition-transform">
              <Gamepad2 className="w-5 h-5" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="font-extrabold tracking-wider text-sm text-foreground uppercase">
                  Nexus
                </span>
                <span className="text-[10px] text-muted-foreground font-mono -mt-1">
                  Gaming Comm
                </span>
              </div>
            )}
          </Link>

          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-surface-hover transition-colors"
              title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
              aria-label="Toggle Sidebar"
            >
              {collapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {/* Primary Social Hub Item */}
        <div className="p-2 space-y-1 mt-2">
          <button
            onClick={() => onSelectConversation?.(null)}
            className={cn(
              'w-full flex items-center rounded-xl p-2.5 text-xs font-semibold transition-all group relative text-left',
              !selectedConversationId && pathname === '/'
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground',
              collapsed ? 'justify-center' : 'justify-between'
            )}
            title={collapsed ? 'Friends & Social' : undefined}
          >
            <div className="flex items-center gap-3">
              <Users
                className={cn(
                  'w-4 h-4 shrink-0 transition-transform group-hover:scale-110',
                  !selectedConversationId ? 'text-primary' : 'text-muted-foreground'
                )}
              />
              {!collapsed && <span>Friends & Social</span>}
            </div>

            {!collapsed && (
              <Badge variant="subtle" className="text-[10px] px-1.5 py-0 h-4">
                Hub
              </Badge>
            )}

            {!selectedConversationId && (
              <span className="absolute left-0 top-2 bottom-2 w-1 bg-primary rounded-r-full shadow-glow-sm" />
            )}
          </button>
        </div>

        {/* Direct Messages Section */}
        <div className="p-2 mt-2">
          {!collapsed && (
            <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
              <span>Direct Messages</span>
              <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          )}

          <div className="space-y-1 mt-1.5">
            {conversations.map((conv) => {
              const otherMember =
                conv.members.find((m) => m.user_id !== user?.id)?.profile || null;
              const isSelected = selectedConversationId === conv.id;
              const title = otherMember?.display_name || conv.name || 'Squad Chat';

              return (
                <div
                  key={conv.id}
                  onClick={() => onSelectConversation?.(conv.id)}
                  className={cn(
                    'flex items-center gap-2.5 p-2 rounded-xl text-xs font-medium cursor-pointer transition-all group relative',
                    isSelected
                      ? 'bg-primary/15 text-primary font-semibold'
                      : 'hover:bg-surface-hover text-muted-foreground hover:text-foreground',
                    collapsed ? 'justify-center' : ''
                  )}
                  title={title}
                >
                  <Avatar
                    src={otherMember?.avatar_url}
                    name={title}
                    status={otherMember?.status || 'online'}
                    showStatus
                    size="sm"
                  />

                  {!collapsed && (
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-foreground group-hover:text-primary transition-colors text-xs">
                        {title}
                      </div>
                      {conv.last_message && (
                        <div className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
                          {conv.last_message.content}
                        </div>
                      )}
                    </div>
                  )}

                  {isSelected && (
                    <span className="absolute left-0 top-2 bottom-2 w-1 bg-primary rounded-r-full shadow-glow-sm" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Servers / Squads List Preview */}
        <div className="p-2 mt-2">
          {!collapsed && (
            <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
              <span>Servers & Squads</span>
            </div>
          )}

          <div className="space-y-1.5 mt-1.5">
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
                  onClick={() => router.push(`/?s=${server.id}&ch=${server.channels[0]?.id || ''}`)}
                  className={cn(
                    'flex items-center gap-3 p-2 rounded-xl text-xs font-medium cursor-pointer transition-all hover:bg-surface-hover group',
                    collapsed ? 'justify-center' : ''
                  )}
                  title={server.name}
                >
                  <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center font-bold text-[10px] text-primary shrink-0 group-hover:rounded-md group-hover:bg-primary group-hover:text-primary-foreground transition-all shadow-sm">
                    {tag}
                  </div>
                  {!collapsed && (
                    <span className="truncate text-foreground group-hover:text-primary transition-colors">
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
        <div className="p-3 border-t border-border/40 text-[10px] text-muted-foreground/60 font-mono text-center">
          Nexus v0.2 • Social & Messaging Online
        </div>
      )}
    </aside>
  );
}
