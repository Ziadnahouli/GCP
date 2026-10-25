'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Check, Users, Shield, ArrowRight, Loader2, Sparkles, Phone, PhoneOff, Radio, Volume2 } from 'lucide-react';
import { useServers } from '@/hooks/use-servers';
import { useCallState, useCallActions } from '@/features/calls/call-context';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { getBrowserClient } from '@/lib/supabase/client';
import { realtimeHub } from '@/lib/realtime/realtime-hub';
import { Server } from '@/lib/types/server';
import { LinkPreviewCard } from '@/components/chat/link-preview';

interface MessageContentProps {
  content?: string | null;
  isMe?: boolean;
  isCallActive?: boolean;
}

// Regex matching /invite/<code>, /?join=<code>, or full URL with invite code
const SERVER_INVITE_REGEX = /(?:https?:\/\/[^\s]+)?(?:\/invite\/|[?&]join=|\/join\/)([a-zA-Z0-9_-]{6,36})/i;
const SQUAD_CALL_REGEX = /\[(?:join-squad-call|join-call):([0-9a-f-]{36})\]/i;
const GENERAL_URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
const MENTION_TOKEN_REGEX = /(@[a-zA-Z0-9_.-]+)/g;

export function MessageContent({ content, isMe = false, isCallActive }: MessageContentProps) {
  const router = useRouter();
  const { servers, joinServer } = useServers();
  const callState = useCallState();
  const callActions = useCallActions();
  const { toast } = useToast();
  const supabase = React.useMemo(() => getBrowserClient(), []);

  const safeContent = content ?? '';

  const [isJoining, setIsJoining] = React.useState(false);
  const [serverMeta, setServerMeta] = React.useState<{
    serverId?: string;
    name?: string;
    icon_url?: string | null;
    memberCount?: number;
  } | null>(null);

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

    const topic = `call-room-${squadCallConvId}`;
    const unsubChanges = realtimeHub.on(
      topic,
      {
        type: 'postgres_changes',
        event: '*',
        schema: 'public',
        table: 'call_sessions',
        filter: `conversation_id=eq.${squadCallConvId}`,
      },
      () => checkSession()
    );

    const unsubActive = realtimeHub.on(
      topic,
      { type: 'broadcast', event: 'squad_call_active' },
      ({ payload }: any) => {
        if (mounted) {
          lastHeartbeatRef.current = Date.now();
          setSessionActive(true);
          if (payload?.participants && Array.isArray(payload.participants)) {
            setBroadcastParticipants(payload.participants);
          }
        }
      }
    );

    const unsubEnded = realtimeHub.on(
      topic,
      { type: 'broadcast', event: 'squad_call_ended' },
      () => {
        if (mounted) {
          lastHeartbeatRef.current = 0;
          setSessionActive(false);
          setBroadcastParticipants([]);
        }
      }
    );

    return () => {
      mounted = false;
      lastHeartbeatRef.current = 0;
      unsubChanges();
      unsubActive();
      unsubEnded();
    };
  }, [squadCallConvId, isCallActive]);

  const activeParticipants: Array<{ id: string; name: string; avatar_url?: string | null; isSpeaking?: boolean; isMuted?: boolean }> = React.useMemo(() => {
    if (!squadCallConvId) return [];
    const fromCtx = callActions.getSquadCallParticipants?.(squadCallConvId) || [];
    if (fromCtx.length > 0) return fromCtx;
    if (broadcastParticipants.length > 0) return broadcastParticipants;
    const squad = callState.activeSquadCalls?.get(squadCallConvId);
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
  }, [squadCallConvId, callActions, callState.activeSquadCalls, broadcastParticipants]);

  const isLive = isCallActive !== undefined
    ? isCallActive
    : (sessionActive || (squadCallConvId && (callState.activeSquadCalls?.get(squadCallConvId) || callActions.isSquadCallActive?.(squadCallConvId))) || (callState.activeConversationId === squadCallConvId && (callState.callStatus === 'in_call' || callState.callStatus === 'incoming_ringing')));

  // Check if content contains a server invite
  const inviteMatch = React.useMemo(() => {
    return safeContent.match(SERVER_INVITE_REGEX);
  }, [safeContent]);

  const inviteCode = inviteMatch ? inviteMatch[1] : null;

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
    if (!serverMeta?.serverId) return null;
    return servers.find((s) => s.id.toLowerCase() === serverMeta.serverId?.toLowerCase()) || null;
  }, [servers, serverMeta?.serverId]);

  // Fetch server preview metadata using get_server_preview RPC
  React.useEffect(() => {
    if (!inviteCode) return;

    let mounted = true;
    const fetchPreview = async () => {
      try {
        const { data, error } = await supabase.rpc('get_server_preview', {
          p_code: inviteCode,
        });

        if (mounted && data && !error) {
          setServerMeta({
            name: data.name,
            icon_url: data.icon_url,
            memberCount: data.member_count || 1,
            serverId: data.server_id,
          });
        }
      } catch (err) {
        void err;
      }
    };

    fetchPreview();

    return () => {
      mounted = false;
    };
  }, [inviteCode, supabase]);

  const handleJoinOrNavigate = async () => {
    if (!inviteCode) return;

    if (existingServer) {
      const firstChannel = existingServer.channels?.[0]?.id || '';
      router.push(`/?s=${existingServer.id}&ch=${firstChannel}`);
      return;
    }

    setIsJoining(true);
    try {
      const res = await joinServer(inviteCode);
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
                      ? 'text-white hover:text-foreground/80'
                      : 'text-primary hover:text-primary'
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
                        'inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-semibold mx-0.5 select-none transition-colors',
                        isSpecial
                          ? 'bg-warning/20 text-warning border border-warning/30 font-bold hover:bg-warning/30'
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
            className="mt-2.5 w-full max-w-sm rounded-xl border border-success/30 bg-card backdrop-blur-md p-3.5 shadow-xl select-none text-left flex flex-col gap-2.5 animate-in fade-in"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-success/20 border border-success/30 flex items-center justify-center text-success shrink-0 shadow-inner">
                  <Phone className="w-5 h-5 animate-pulse" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-success animate-ping" />
                    <span className="text-xs font-bold text-foreground tracking-tight">Squad Voice Call</span>
                  </div>
                  <p className="text-xs text-success/80 truncate mt-0.5">
                    {activeParticipants.length > 0
                      ? `${activeParticipants.length} squadmate${activeParticipants.length === 1 ? '' : 's'} in call`
                      : 'Squad call is live. Tap to join!'}
                  </p>
                </div>
              </div>

              <div className="shrink-0">
                {callState.activeConversationId === squadCallConvId && callState.callStatus === 'in_call' ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-success/20 border border-success/30 text-success font-semibold text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-success" />
                    <span>Connected</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (callState.callStatus === 'incoming_ringing') {
                        callActions.acceptCall();
                      } else {
                        callActions.startCall(squadCallConvId, squadCallConvId, false);
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success hover:bg-success text-white font-semibold text-xs shadow-md shadow-emerald-900/40 transition-all hover:scale-[1.02]"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Join Voice</span>
                  </button>
                )}
              </div>
            </div>

            {/* List of squad members currently inside the call */}
            {activeParticipants.length > 0 && (
              <div className="pt-2 border-t border-success/20 flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-success/90 uppercase tracking-wider mr-1">
                  In Voice ({activeParticipants.length}):
                </span>
                {activeParticipants.map((p) => (
                  <div
                    key={p.id}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success/15 border border-success/30 text-success text-xs font-medium transition-all"
                    title={p.name}
                  >
                    <span
                      className={cn(
                        'w-1.5 h-1.5 rounded-full shrink-0',
                        p.isSpeaking ? 'bg-success animate-pulse' : 'bg-success/60'
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
            className="mt-2.5 w-full max-w-sm rounded-xl border border-border bg-surface-default backdrop-blur-md p-3.5 shadow-md select-none text-left flex items-center justify-between gap-3 animate-in fade-in"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-surface-default border border-border flex items-center justify-center text-muted-foreground shrink-0">
                <PhoneOff className="w-5 h-5 text-muted-foreground/70" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                  <span className="text-xs font-bold text-foreground/80 tracking-tight">Squad Voice Call</span>
                </div>
                <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
                  Call ended
                </p>
              </div>
            </div>

            <div className="shrink-0">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-default border border-border text-muted-foreground text-xs font-semibold select-none">
                <PhoneOff className="w-3.5 h-3.5 text-muted-foreground/60" />
                <span>Call Ended</span>
              </div>
            </div>
          </div>
        )
      )}

      {/* Interactive App-Style Server Invite Card */}
      {inviteCode && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-2 w-full max-w-sm rounded-xl border border-border bg-card/95 backdrop-blur-md p-3.5 shadow-xl transition-all hover:border-primary/40 select-none text-left"
        >
          <div className="text-xs uppercase font-bold tracking-wider text-muted-foreground/80 mb-2.5 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-primary animate-pulse" />
            <span>You&apos;ve been invited to join a server</span>
          </div>

          <div className="flex items-center justify-between gap-3">
            {/* Server Avatar & Details */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-surface-header border border-border flex items-center justify-center font-bold text-base text-primary shrink-0 overflow-hidden shadow-inner">
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
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
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
                  ? 'bg-surface-hover hover:bg-surface-hover text-foreground border border-border'
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
                  <Check className="w-3.5 h-3.5 text-success" />
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
