'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Hash,
  Volume2,
  Users,
  MessageSquare,
  Shield,
  Clock,
  Sparkles,
  ArrowRight,
  Terminal,
  Settings,
  X,
  Loader2,
  CornerDownLeft,
} from 'lucide-react';
import { useServers } from '@/hooks/use-servers';
import { useConversations } from '@/hooks/use-conversations';
import { useSocial } from '@/hooks/use-social';
import { useAuth } from '@/features/auth/auth-provider';
import { getBrowserClient } from '@/lib/supabase/client';
import { triggerOpenLogsWindow } from '@/hooks/use-diagnostics-logs';
import { useModalEscape } from '@/hooks/use-modal-escape';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export interface GlobalSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings?: () => void;
  onOpenSoundboard?: () => void;
}

interface SearchResultItem {
  id: string;
  category: 'channel' | 'server' | 'conversation' | 'user' | 'message' | 'action';
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  avatarUrl?: string | null;
  action: () => void | Promise<void>;
}

const RECENT_SEARCHES_KEY = 'nexus_recent_searches';

export function GlobalSearchModal({
  open,
  onOpenChange,
  onOpenSettings,
  onOpenSoundboard,
}: GlobalSearchModalProps) {
  const router = useRouter();
  const { user, isConfigured } = useAuth();
  const { servers } = useServers();
  const { conversations, getOrCreateDirectConversation } = useConversations();
  const { friends } = useSocial();
  const supabase = React.useMemo(() => getBrowserClient(), []);
  useModalEscape(open, onOpenChange);

  const [query, setQuery] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [isSearchingMessages, setIsSearchingMessages] = React.useState(false);
  const [messageResults, setMessageResults] = React.useState<SearchResultItem[]>([]);
  const [userResults, setUserResults] = React.useState<SearchResultItem[]>([]);
  const [recentSearches, setRecentSearches] = React.useState<string[]>([]);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Load recent searches on mount/open
  React.useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      try {
        const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
        if (stored) {
          setRecentSearches(JSON.parse(stored).slice(0, 6));
        }
      } catch {}
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  // Save recent search
  const saveRecentSearch = React.useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      const existing: string[] = stored ? JSON.parse(stored) : [];
      const updated = [trimmed, ...existing.filter((t) => t.toLowerCase() !== trimmed.toLowerCase())].slice(0, 6);
      setRecentSearches(updated);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch {}
  }, []);

  const clearRecentSearches = React.useCallback(() => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {}
  }, []);

  // Server & Channel synchronous results
  const localResults = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const items: SearchResultItem[] = [];

    if (!q) return items;

    // 1. Search Channels & Servers
    servers.forEach((server) => {
      // Check server name
      if (server.name.toLowerCase().includes(q)) {
        items.push({
          id: `server-${server.id}`,
          category: 'server',
          title: server.name,
          subtitle: `Server • ${server.channels.length} channels`,
          icon: <Shield className="w-4 h-4 text-primary" />,
          action: () => {
            saveRecentSearch(query);
            onOpenChange(false);
            const firstChan = server.channels[0]?.id || '';
            router.push(`/?s=${server.id}&ch=${firstChan}`);
          },
        });
      }

      // Check channels
      server.channels.forEach((chan) => {
        if (chan.name.toLowerCase().includes(q) || (chan.topic && chan.topic.toLowerCase().includes(q))) {
          items.push({
            id: `chan-${chan.id}`,
            category: 'channel',
            title: `#${chan.name}`,
            subtitle: `${server.name} • ${chan.type === 'voice' ? 'Voice Lounge' : 'Text Channel'}`,
            icon: chan.type === 'voice' ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <Hash className="w-4 h-4 text-primary" />
            ),
            action: () => {
              saveRecentSearch(query);
              onOpenChange(false);
              router.push(`/?s=${server.id}&ch=${chan.id}`);
            },
          });
        }
      });
    });

    // 2. Search Direct Conversations
    conversations.forEach((conv) => {
      const other = conv.members.find((m) => m.user_id !== user?.id)?.profile;
      const title = other?.display_name || conv.name || 'Chat';
      const subtitle = other?.username ? `@${other.username}` : 'Direct Message';
      if (
        title.toLowerCase().includes(q) ||
        (other?.username && other.username.toLowerCase().includes(q))
      ) {
        items.push({
          id: `conv-${conv.id}`,
          category: 'conversation',
          title,
          subtitle,
          avatarUrl: other?.avatar_url || null,
          icon: <MessageSquare className="w-4 h-4 text-sky-400" />,
          action: () => {
            saveRecentSearch(query);
            onOpenChange(false);
            router.push(`/?c=${conv.id}`);
          },
        });
      }
    });

    // 3. Search Friends
    friends.forEach((f) => {
      const fr = f.friend;
      if (
        fr.display_name.toLowerCase().includes(q) ||
        fr.username.toLowerCase().includes(q)
      ) {
        if (!items.some((it) => it.title === fr.display_name)) {
          items.push({
            id: `friend-${fr.id}`,
            category: 'user',
            title: fr.display_name,
            subtitle: `@${fr.username} • Friend`,
            avatarUrl: fr.avatar_url,
            icon: <Users className="w-4 h-4 text-emerald-400" />,
            action: async () => {
              saveRecentSearch(query);
              onOpenChange(false);
              const { conversationId } = await getOrCreateDirectConversation(fr.id);
              if (conversationId) router.push(`/?c=${conversationId}`);
              else router.push('/');
            },
          });
        }
      }
    });

    return items;
  }, [query, servers, conversations, friends, user?.id, router, onOpenChange, saveRecentSearch, getOrCreateDirectConversation]);

  // Quick Action Results
  const actionResults = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const actions: SearchResultItem[] = [
      {
        id: 'action-friends',
        category: 'action',
        title: 'Friends & Squad Social Hub',
        subtitle: 'View online friends, pending invites, and squad members',
        icon: <Users className="w-4 h-4 text-emerald-400" />,
        action: () => {
          onOpenChange(false);
          router.push('/');
        },
      },
      {
        id: 'action-settings',
        category: 'action',
        title: 'Open Studio Settings',
        subtitle: 'Configure audio input, themes, and notification preferences',
        icon: <Settings className="w-4 h-4 text-primary" />,
        action: () => {
          onOpenChange(false);
          if (onOpenSettings) onOpenSettings();
          else if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('nexus-open-settings'));
          }
        },
      },
      {
        id: 'action-soundboard',
        category: 'action',
        title: 'Gaming Soundboard',
        subtitle: 'Play tactical callout clips and squad sound effects',
        icon: <Sparkles className="w-4 h-4 text-amber-400" />,
        action: () => {
          onOpenChange(false);
          if (onOpenSoundboard) onOpenSoundboard();
        },
      },
      {
        id: 'action-diagnostics',
        category: 'action',
        title: 'Diagnostics & Live Telemetry Console',
        subtitle: 'Inspect WebRTC stats, ICE candidates, and system logs',
        icon: <Terminal className="w-4 h-4 text-sky-400" />,
        action: () => {
          onOpenChange(false);
          triggerOpenLogsWindow();
        },
      },
    ];

    if (!q) return actions;
    return actions.filter(
      (a) => a.title.toLowerCase().includes(q) || (a.subtitle && a.subtitle.toLowerCase().includes(q))
    );
  }, [query, router, onOpenChange, onOpenSettings, onOpenSoundboard]);

  // Debounced asynchronous server-side search for accessible messages and remote users
  React.useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || !isConfigured || !supabase) {
      setMessageResults([]);
      setUserResults([]);
      setIsSearchingMessages(false);
      return;
    }

    setIsSearchingMessages(true);
    const timer = setTimeout(async () => {
      try {
        // 1. Search accessible messages bounded by 8
        const { data: msgData } = await supabase
          .from('messages')
          .select('id, content, conversation_id, channel_id, created_at, sender:sender_id(display_name, username)')
          .ilike('content', `%${trimmed}%`)
          .limit(8);

        if (msgData) {
          const mappedMsgs: SearchResultItem[] = msgData.map((m: any) => ({
            id: `msg-${m.id}`,
            category: 'message',
            title: m.content,
            subtitle: `Message by ${m.sender?.display_name || 'Squadmate'} • ${new Date(m.created_at).toLocaleDateString()}`,
            icon: <MessageSquare className="w-4 h-4 text-muted-foreground" />,
            action: () => {
              saveRecentSearch(trimmed);
              onOpenChange(false);
              if (m.conversation_id) {
                router.push(`/?c=${m.conversation_id}`);
              } else if (m.channel_id) {
                // Find server containing this channel
                const foundServer = servers.find((s) => s.channels.some((c) => c.id === m.channel_id));
                if (foundServer) {
                  router.push(`/?s=${foundServer.id}&ch=${m.channel_id}`);
                }
              }
            },
          }));
          setMessageResults(mappedMsgs);
        }

        // 2. Search profiles for users not already in local results
        const { data: profData } = await supabase
          .from('profiles')
          .select('id, display_name, username, avatar_url')
          .or(`display_name.ilike.%${trimmed}%,username.ilike.%${trimmed}%`)
          .neq('id', user?.id || '')
          .limit(5);

        if (profData) {
          const mappedUsers: SearchResultItem[] = profData
            .filter((p: any) => !localResults.some((lr) => lr.title === p.display_name))
            .map((p: any) => ({
              id: `prof-${p.id}`,
              category: 'user',
              title: p.display_name,
              subtitle: `@${p.username}`,
              avatarUrl: p.avatar_url,
              icon: <Users className="w-4 h-4 text-primary" />,
              action: async () => {
                saveRecentSearch(trimmed);
                onOpenChange(false);
                const { conversationId } = await getOrCreateDirectConversation(p.id);
                if (conversationId) router.push(`/?c=${conversationId}`);
                else router.push('/');
              },
            }));
          setUserResults(mappedUsers);
        }
      } catch (err) {
        console.warn('[GlobalSearch] Remote search notice:', err);
      } finally {
        setIsSearchingMessages(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, isConfigured, supabase, user?.id, localResults, servers, router, onOpenChange, saveRecentSearch, getOrCreateDirectConversation]);

  // Aggregate all results
  const allResults = React.useMemo(() => {
    if (!query.trim()) {
      return actionResults;
    }
    return [...localResults, ...userResults, ...messageResults, ...actionResults];
  }, [query, localResults, userResults, messageResults, actionResults]);

  // Clamp selected index
  React.useEffect(() => {
    if (selectedIndex >= allResults.length) {
      setSelectedIndex(Math.max(0, allResults.length - 1));
    }
  }, [allResults.length, selectedIndex]);

  // Keyboard navigation
  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, allResults.length));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + allResults.length) % Math.max(1, allResults.length));
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const selected = allResults[selectedIndex];
        if (selected) {
          selected.action();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange, allResults, selectedIndex]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 select-none animate-in fade-in duration-150">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        onClick={() => onOpenChange(false)}
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-2xl rounded-2xl bg-[#0d0e15] border border-white/[0.08] shadow-2xl shadow-black/95 text-foreground overflow-hidden flex flex-col max-h-[80vh] z-10 animate-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="h-14 px-4 border-b border-white/[0.06] flex items-center gap-3 bg-surface-header/80">
          <Search className="w-5 h-5 text-primary shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channels, servers, people, or messages... [Esc to close]"
            aria-label="Global Search"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          />
          {isSearchingMessages && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />}
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 text-muted-foreground hover:text-foreground rounded-md transition-colors"
              title="Clear search query"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-white/[0.06] text-[10px] font-mono text-muted-foreground border border-white/[0.06]">
            ESC
          </kbd>
        </div>

        {/* Recent Searches Chips (when query is empty) */}
        {!query && recentSearches.length > 0 && (
          <div className="px-4 py-2 border-b border-white/[0.04] bg-white/[0.01] flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Clock className="w-3.5 h-3.5 text-muted-foreground/60 mr-1" />
              <span className="text-[11px] text-muted-foreground/60 mr-1">Recent:</span>
              {recentSearches.map((term) => (
                <button
                  key={term}
                  onClick={() => setQuery(term)}
                  className="px-2 py-0.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {term}
                </button>
              ))}
            </div>
            <button
              onClick={clearRecentSearches}
              className="text-[10px] text-muted-foreground/50 hover:text-rose-400 transition-colors"
            >
              Clear
            </button>
          </div>
        )}

        {/* Results List */}
        <div ref={listRef} className="overflow-y-auto flex-1 p-2 space-y-1 max-h-[460px] no-scrollbar">
          {allResults.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto text-muted-foreground/60">
                <Search className="w-5 h-5 text-muted-foreground/40" />
              </div>
              <div className="text-xs font-semibold text-foreground">
                {query ? `No results found for "${query}"` : 'Type to search across Nexus'}
              </div>
              <p className="text-[11px] text-muted-foreground/60 max-w-xs mx-auto">
                {query
                  ? 'Check for spelling or try searching for another server, squadmate, or keyword.'
                  : 'Search for any server, channel, friend, direct message conversation, or message history.'}
              </p>
            </div>
          ) : (
            allResults.map((item, idx) => {
              const isSelected = idx === selectedIndex;

              return (
                <div
                  key={item.id}
                  onClick={() => item.action()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    'group flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-colors text-left',
                    isSelected
                      ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
                      : 'hover:bg-white/[0.03] text-foreground border border-transparent'
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {item.avatarUrl !== undefined ? (
                      <Avatar src={item.avatarUrl} name={item.title} size="sm" />
                    ) : (
                      <div
                        className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                          isSelected
                            ? 'bg-primary/20 text-primary'
                            : 'bg-white/[0.04] border border-white/[0.06] text-muted-foreground'
                        )}
                      >
                        {item.icon}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-foreground truncate">{item.title}</span>
                        <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-white/[0.04] text-muted-foreground/60">
                          {item.category}
                        </span>
                      </div>
                      {item.subtitle && (
                        <div className="text-[11px] text-muted-foreground/70 truncate leading-snug mt-0.5">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {isSelected && (
                      <div className="hidden sm:flex items-center gap-1 text-[10px] text-primary font-mono px-2 py-0.5 rounded bg-primary/20">
                        <span>Jump</span>
                        <CornerDownLeft className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Shortcut Helper */}
        <div className="px-4 py-2 border-t border-white/[0.06] bg-black/40 flex items-center justify-between text-[10px] font-mono text-muted-foreground/60">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-white">↑</kbd>{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-white">↓</kbd> Navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-white">↵</kbd> Select
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-white">Esc</kbd> Close
            </span>
          </div>
          <div className="hidden sm:block">Nexus Global Command Search</div>
        </div>
      </div>
    </div>
  );
}
