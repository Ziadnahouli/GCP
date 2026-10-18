'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Check, Users, Shield, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { useServers } from '@/hooks/use-servers';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { getBrowserClient } from '@/lib/supabase/client';
import { Server } from '@/lib/types/server';
import { LinkPreviewCard } from '@/components/chat/link-preview';

interface MessageContentProps {
  content: string;
  isMe?: boolean;
}

// UUID regex for matching server invites
const SERVER_INVITE_REGEX = /(?:https?:\/\/[^\s]+[?&]join=|\/?\?join=|\/join\/|\/invite\/)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const GENERAL_URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

export function MessageContent({ content, isMe = false }: MessageContentProps) {
  const router = useRouter();
  const { servers, joinServer } = useServers();
  const { toast } = useToast();

  const [isJoining, setIsJoining] = React.useState(false);
  const [serverMeta, setServerMeta] = React.useState<{ name?: string; icon_url?: string | null; memberCount?: number } | null>(null);

  // Check if content contains a server invite
  const inviteMatch = React.useMemo(() => {
    return content.match(SERVER_INVITE_REGEX);
  }, [content]);

  const inviteServerId = inviteMatch ? inviteMatch[1] : null;

  // Check if content contains a general web URL for safe preview (excluding server invites)
  const previewUrl = React.useMemo(() => {
    if (inviteMatch) return null;
    const match = content.match(/https?:\/\/[^\s]+/i);
    return match ? match[0] : null;
  }, [content, inviteMatch]);

  // Check if user is already a member
  const existingServer = React.useMemo(() => {
    if (!inviteServerId) return null;
    return servers.find((s) => s.id.toLowerCase() === inviteServerId.toLowerCase()) || null;
  }, [servers, inviteServerId]);

  // If server metadata is not in local list, attempt to fetch basic info for preview
  React.useEffect(() => {
    if (!inviteServerId) return;

    if (existingServer) {
      setServerMeta({
        name: existingServer.name,
        icon_url: existingServer.icon_url,
        memberCount: existingServer.members?.length || 1,
      });
      return;
    }

    // Attempt to extract server name from message text if available: e.g. 'server "NAME" on Nexus'
    const nameMatch = content.match(/server\s+"([^"]+)"/i);
    const fallbackName = nameMatch ? nameMatch[1] : 'Squad Server';

    setServerMeta({
      name: fallbackName,
      icon_url: null,
      memberCount: 1,
    });

    const supabase = getBrowserClient();
    supabase
      .from('servers')
      .select('name, icon_url')
      .eq('id', inviteServerId)
      .maybeSingle()
      .then(
        ({ data }) => {
          if (data) {
            setServerMeta((prev) => ({
              name: data.name || prev?.name,
              icon_url: data.icon_url || prev?.icon_url,
              memberCount: prev?.memberCount || 1,
            }));
          }
        },
        () => {}
      );
  }, [inviteServerId, existingServer, content]);

  const handleJoinOrNavigate = async () => {
    if (!inviteServerId) return;

    if (existingServer) {
      const firstChannel = existingServer.channels?.[0]?.id || '';
      router.push(`/?s=${existingServer.id}&ch=${firstChannel}`);
      return;
    }

    setIsJoining(true);
    try {
      const res = await joinServer(inviteServerId);
      if (res.success && res.server) {
        toast({
          title: 'Joined Server!',
          description: `You are now a squadmate in ${res.server.name}.`,
          type: 'success',
        });
        const firstChannel = res.server.channels?.[0]?.id || '';
        router.push(`/?s=${res.server.id}&ch=${firstChannel}`);
      } else {
        toast({
          title: 'Join Failed',
          description: res.error || 'Could not join server.',
          type: 'error',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message || 'Failed to join server.',
        type: 'error',
      });
    } finally {
      setIsJoining(false);
    }
  };

  // Render text with clickable links
  const renderTextWithLinks = (text: string) => {
    // If there's an invite link, hide the raw invite link URL from the text so the embed card replaces it
    let cleanText = text;
    if (inviteMatch && inviteMatch[0]) {
      cleanText = cleanText.replace(inviteMatch[0], '').trim();
    }

    if (!cleanText) return null;

    const parts = cleanText.split(GENERAL_URL_REGEX);

    return (
      <span className="leading-relaxed">
        {parts.map((part, index) => {
          if (part.match(GENERAL_URL_REGEX)) {
            const rawHref = part.startsWith('www.') ? `https://${part}` : part;
            let isSafeUrl = false;
            try {
              const u = new URL(rawHref);
              isSafeUrl = u.protocol === 'http:' || u.protocol === 'https:';
            } catch {}

            if (isSafeUrl) {
              return (
                <a
                  key={index}
                  href={rawHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    'inline-flex items-center gap-0.5 underline underline-offset-2 break-all font-medium transition-colors',
                    isMe
                      ? 'text-white hover:text-white/80'
                      : 'text-sky-400 hover:text-sky-300'
                  )}
                >
                  <span>{part}</span>
                  <ExternalLink className="w-3 h-3 inline shrink-0 opacity-80" />
                </a>
              );
            }
          }
          return <span key={index}>{part}</span>;
        })}
      </span>
    );
  };

  return (
    <div className="space-y-2">
      {/* Text message content with link detection */}
      <div>{renderTextWithLinks(content)}</div>

      {/* Interactive App-Style Server Invite Card */}
      {inviteServerId && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-2 w-full max-w-sm rounded-xl border border-white/[0.12] bg-[#0d0e15]/95 backdrop-blur-md p-3.5 shadow-xl transition-all hover:border-primary/40 select-none text-left"
        >
          <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80 mb-2.5 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-primary animate-pulse" />
            <span>You&apos;ve been invited to join a server</span>
          </div>

          <div className="flex items-center justify-between gap-3">
            {/* Server Avatar & Details */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-surface-header border border-white/[0.1] flex items-center justify-center font-bold text-base text-primary shrink-0 overflow-hidden shadow-inner">
                {serverMeta?.icon_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={serverMeta.icon_url}
                    alt={serverMeta?.name || 'Server'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{(serverMeta?.name || 'S').slice(0, 2).toUpperCase()}</span>
                )}
              </div>

              <div className="min-w-0">
                <div className="font-bold text-sm text-foreground truncate leading-tight">
                  {serverMeta?.name || 'Squad Gaming Server'}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Active Server</span>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    <span>Lounge</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Action Join / Go Button */}
            <button
              onClick={handleJoinOrNavigate}
              disabled={isJoining}
              className={cn(
                'px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-all shadow-md',
                existingServer
                  ? 'bg-white/[0.08] hover:bg-white/[0.12] text-foreground border border-white/[0.1]'
                  : 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/25'
              )}
            >
              {isJoining ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Joining...</span>
                </>
              ) : existingServer ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Go to Server</span>
                </>
              ) : (
                <>
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Join</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Safe Link Preview Card */}
      {previewUrl && (
        <div className="mt-2 max-w-sm">
          <LinkPreviewCard url={previewUrl} />
        </div>
      )}
    </div>
  );
}
