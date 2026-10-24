'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Check, Users, Shield, ArrowRight, Loader2, Sparkles, Phone, PhoneOff, Radio, Volume2 } from 'lucide-react';
import { useServers } from '@/hooks/use-servers';
import { useCallContext } from '@/features/calls/call-context';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { getBrowserClient } from '@/lib/supabase/client';
import { Server } from '@/lib/types/server';
import { LinkPreviewCard } from '@/components/chat/link-preview';

interface MessageContentProps {
  content?: string | null;
  isMe?: boolean;
  isCallActive?: boolean;
}

// UUID regex for matching server invites
const SERVER_INVITE_REGEX = /(?:https?:\/\/[^\s]+[?&]join=|\/?\?join=|\/join\/|\/invite\/)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const SQUAD_CALL_REGEX = /\[(?:join-squad-call|join-call):([0-9a-f-]{36})\]/i;
const GENERAL_URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
const MENTION_TOKEN_REGEX = /(@[a-zA-Z0-9_.-]+)/g;

export function MessageContent({ content, isMe = false, isCallActive }: MessageContentProps) {
  const router = useRouter();
  const { servers, joinServer } = useServers();
  const call = useCallContext();
  const { toast } = useToast();
  const supabase = React.useMemo(() => getBrowserClient(), []);

  const safeContent = content ?? '';

  const [isJoining, setIsJoining] = React.useState(false);
  const [serverMeta, setServerMeta] = React.useState<{ name?: string; icon_url?: string | null; memberCount?: number } | null>(null);

  // Check if content contains a squad voice call beacon
  const squadCallMatch = React.useMemo(() => {
    return safeContent.match(SQUAD_CALL_REGEX);
  }, [safeContent]);

  const squadCallConvId = squadCallMatch ? squadCallMatch[1] : null;

  // Local fallback check if isCallActive prop is not explicitly passed
  const [sessionActive, setSessionActive] = React.useState<boolean>(false);
  const [broadcastParticipants, setBroadcastParticipants] = React.useState<
    Array<{ id: string; name: string; avatar_url?: string | null; isSpeaking?: boolean; isMuted?: boolean }>
  >([]);

  const lastHeartbeatRef = React.useRef<number>(0);

  React.useEffect(() => {
    if (!squadCallConvId || isCallActive !== undefined) return;

    let mounted = true;
    const checkSession = async () => {
      try {
        const { data } = await supabase
          .from('call_sessions')
          .select('id, status')
          .eq('conversation_id', squadCallConvId)
          .in('status', ['active', 'ringing', 'in_call'])
          .limit(1)
          .maybeSingle();

        if (mounted) {
          if (data) {
            setSessionActive(true);
          } else if (Date.now() - lastHeartbeatRef.current > 10000) {
            setSessionActive(false);
          }
        }
      } catch {}
    };

    checkSession();

    const ch = supabase
      .channel(`call-room-${squadCallConvId}`, { config: { private: true } })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'call_sessions', filter: `conversation_id=eq.${squadCallConvId}` },
        () => checkSession()
      )
      .on('broadcast', { event: 'squad_call_active' }, ({ payload }: any) => {
        if (mounted) {
          lastHeartbeatRef.current = Date.now();
          setSessionActive(true);
          if (payload?.participants && Array.isArray(payload.participants)) {
            setBroadcastParticipants(payload.participants);
          }
        }
      })
      .on('broadcast', { event: 'squad_call_ended' }, () => {
        if (mounted) {
          lastHeartbeatRef.current = 0;
          setSessionActive(false);
          setBroadcastParticipants([]);
        }
      })
      .subscribe();

    return () => {
      mounted = false;
      lastHeartbeatRef.current = 0;
      supabase.removeChannel(ch);
    };
  }, [squadCallConvId, isCallActive, supabase]);

  const activeParticipants: Array<{ id: string; name: string; avatar_url?: string | null; isSpeaking?: boolean; isMuted?: boolean }> = React.useMemo(() => {
    if (!squadCallConvId) return [];
    const fromCtx = call.getSquadCallParticipants?.(squadCallConvId) || [];
    if (fromCtx.length > 0) return fromCtx;
    if (broadcastParticipants.length > 0) return broadcastParticipants;
    const squad = call.activeSquadCalls?.get(squadCallConvId);
    if (squad?.participants && Array.isArray(squad.participants) && squad.participants.length > 0) {
      return squad.participants;
    }
    if (squad?.caller_name) {
      return [
        {
          id: squad.caller_id || 'caller',
          name: squad.caller_name,
          avatar_url: squad.caller_avatar || null,
        },
      ];
    }
    return [];
  }, [squadCallConvId, call, broadcastParticipants]);

  const isLive = isCallActive !== undefined
    ? isCallActive
    : (sessionActive || (squadCallConvId && (call.activeSquadCalls?.get(squadCallConvId) || call.isSquadCallActive?.(squadCallConvId))) || (call.activeConversationId === squadCallConvId && (call.callStatus === 'in_call' || call.callStatus === 'incoming_ringing')));

  // Check if content contains a server invite
  const inviteMatch = React.useMemo(() => {
    return safeContent.match(SERVER_INVITE_REGEX);
  }, [safeContent]);

  const inviteServerId = inviteMatch ? inviteMatch[1] : null;

  // Check if content contains a general web URL for safe preview (excluding server invites)
  const previewUrl = React.useMemo(() => {
    if (inviteMatch || squadCallMatch) return null;
    const match = safeContent.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);
    if (!match) return null;
    let urlStr = match[0];
    if (urlStr.startsWith('www.')) urlStr = `https://${urlStr}`;
    return urlStr;
  }, [safeContent, inviteMatch, squadCallMatch]);

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
    const nameMatch = safeContent.match(/server\s+"([^"]+)"/i);
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
  }, [inviteServerId, existingServer, safeContent]);

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

  // Render text with clickable links and @mentions
  const renderTextWithLinks = (text: string) => {
    let cleanText = text;
    if (inviteMatch && inviteMatch[0]) {
      cleanText = cleanText.replace(inviteMatch[0], '').trim();
    }
    if (squadCallMatch && squadCallMatch[0]) {
      cleanText = cleanText.replace(squadCallMatch[0], '').trim();
    }
    if (squadCallMatch && !isLive) {
      cleanText = cleanText
        .replace(/click Join Voice to connect!?/gi, 'Call ended.')
        .replace(/Click Join Voice to connect!?/gi, 'Call ended.');
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

          // Parse @mentions within non-URL text
          const subParts = part.split(MENTION_TOKEN_REGEX);
          return (
            <React.Fragment key={index}>
              {subParts.map((sub, subIdx) => {
                if (sub.match(/^@[a-zA-Z0-9_.-]+$/)) {
                  const tagLower = sub.toLowerCase();
                  const isSpecial = tagLower === '@everyone' || tagLower === '@all' || tagLower === '@here';
                  return (
                    <span
                      key={subIdx}
                      className={cn(
                        'inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold mx-0.5 select-none transition-colors',
                        isSpecial
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold hover:bg-amber-500/30'
                          : 'bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 cursor-pointer'
                      )}
                    >
                      {sub}
                    </span>
                  );
                }
                return <span key={subIdx}>{sub}</span>;
              })}
            </React.Fragment>
          );
        })}
      </span>
    );
  };

  return (
    <div className="space-y-2">
      {/* Text message content with link and mention detection */}
      <div>{renderTextWithLinks(safeContent)}</div>

      {/* Interactive Squad Voice Call Announcement Card */}
      {squadCallConvId && (
        isLive ? (
          <div
            onClick={(e) => e.stopPropagation()}
            className="mt-2.5 w-full max-w-sm rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-[#0d1411]/90 to-[#0e1713]/95 backdrop-blur-md p-3.5 shadow-xl select-none text-left flex flex-col gap-2.5 animate-in fade-in"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
                  <Phone className="w-5 h-5 animate-pulse" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-xs font-bold text-white tracking-tight">Squad Voice Call</span>
                  </div>
                  <p className="text-[10px] text-emerald-300/80 truncate mt-0.5">
                    {activeParticipants.length > 0
                      ? `${activeParticipants.length} squadmate${activeParticipants.length === 1 ? '' : 's'} in call`
                      : 'Squad call is live. Tap to join!'}
                  </p>
                </div>
              </div>

              <div className="shrink-0">
                {call.activeConversationId === squadCallConvId && call.callStatus === 'in_call' ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-semibold text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Connected</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (call.callStatus === 'incoming_ringing') {
                        call.acceptCall();
                      } else {
                        call.startCall(squadCallConvId, squadCallConvId, false);
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md shadow-emerald-900/40 transition-all hover:scale-[1.02]"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Join Voice</span>
                  </button>
                )}
              </div>
            </div>

            {/* List of squad members currently inside the call */}
            {activeParticipants.length > 0 && (
              <div className="pt-2 border-t border-emerald-500/20 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold text-emerald-400/90 uppercase tracking-wider mr-1">
                  In Voice ({activeParticipants.length}):
                </span>
                {activeParticipants.map((p) => (
                  <div
                    key={p.id}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-[11px] font-medium transition-all"
                    title={p.name}
                  >
                    <span
                      className={cn(
                        'w-1.5 h-1.5 rounded-full shrink-0',
                        p.isSpeaking ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-500/60'
                      )}
                    />
                    <span className="max-w-[120px] truncate">{p.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div
            onClick={(e) => e.stopPropagation()}
            className="mt-2.5 w-full max-w-sm rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md p-3.5 shadow-md select-none text-left flex items-center justify-between gap-3 animate-in fade-in"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-muted-foreground shrink-0">
                <PhoneOff className="w-5 h-5 text-muted-foreground/70" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                  <span className="text-xs font-bold text-foreground/80 tracking-tight">Squad Voice Call</span>
                </div>
                <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
                  Call ended
                </p>
              </div>
            </div>

            <div className="shrink-0">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-muted-foreground text-xs font-semibold select-none">
                <PhoneOff className="w-3.5 h-3.5 text-muted-foreground/60" />
                <span>Call Ended</span>
              </div>
            </div>
          </div>
        )
      )}

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
