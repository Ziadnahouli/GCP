'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Users, Gamepad2, ArrowRight, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/features/auth/auth-provider';
import { useServers } from '@/hooks/use-servers';
import { getBrowserClient } from '@/lib/supabase/client';
import { savePendingInvite } from '@/lib/auth/safe-redirect';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/toast';

interface ServerPreview {
  server_id: string;
  name: string;
  icon_url: string | null;
  member_count: number;
}

export default function InviteLandingPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { servers, joinServer } = useServers();
  const { toast } = useToast();

  const code = (params?.code as string) || '';

  const [loadingPreview, setLoadingPreview] = React.useState(true);
  const [preview, setPreview] = React.useState<ServerPreview | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [joining, setJoining] = React.useState(false);

  // Save invite code for persistence across login/registration
  React.useEffect(() => {
    if (code) {
      savePendingInvite(code);
    }
  }, [code]);

  // Fetch server preview metadata using get_server_preview RPC
  React.useEffect(() => {
    if (!code) {
      setLoadingPreview(false);
      setPreviewError('No invite code specified.');
      return;
    }

    let isMounted = true;
    const fetchPreview = async () => {
      try {
        const supabase = getBrowserClient();
        const { data, error } = await supabase.rpc('get_server_preview', {
          p_code: code.trim(),
        });

        if (!isMounted) return;

        if (error) {
          const msg = error.message || '';
          if (msg.includes('expired') || msg.includes('Invalid') || msg.includes('revoked')) {
            setPreviewError('This invite link is invalid, expired, or has reached maximum uses.');
          } else {
            setPreviewError(msg || 'Unable to load server preview.');
          }
          setPreview(null);
        } else if (data) {
          setPreview(data as ServerPreview);
          setPreviewError(null);
        }
      } catch {
        if (isMounted) {
          setPreviewError('Failed to load server invitation.');
        }
      } finally {
        if (isMounted) {
          setLoadingPreview(false);
        }
      }
    };

    fetchPreview();

    return () => {
      isMounted = false;
    };
  }, [code]);

  const isAlreadyMember = React.useMemo(() => {
    if (!preview || !servers) return false;
    return servers.some((s) => s.id === preview.server_id);
  }, [preview, servers]);

  const handleAcceptInvite = async () => {
    if (!user) {
      router.push(`/login?redirectTo=/invite/${encodeURIComponent(code)}`);
      return;
    }

    if (isAlreadyMember) {
      router.push(`/?s=${preview?.server_id}`);
      return;
    }

    setJoining(true);
    try {
      const res = await joinServer(code);
      if (res.success && res.server) {
        toast({
          title: 'Joined Server!',
          description: `Welcome to ${res.server.name}!`,
          type: 'success',
        });
        const firstChan = res.server.channels?.[0]?.id || '';
        router.push(firstChan ? `/?s=${res.server.id}&ch=${firstChan}` : `/?s=${res.server.id}`);
      } else {
        toast({
          title: 'Join Failed',
          description: res.error || 'Failed to join server.',
          type: 'error',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while joining.',
        type: 'error',
      });
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden bg-background">
      {/* Background ambient lighting */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-primary/[0.05] blur-[120px] rounded-full pointer-events-none" />

      {/* Main card */}
      <div className="relative z-10 w-full max-w-sm mx-auto p-6 sm:p-8 rounded-2xl bg-surface-panel border border-white/[0.08] shadow-2xl shadow-black/90 text-center animate-in zoom-in-95 duration-150">
        {loadingPreview ? (
          <div className="py-8 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground font-mono">Loading squad invitation...</p>
          </div>
        ) : previewError || !preview ? (
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Invite Unavailable</h2>
              <p className="text-xs text-muted-foreground/70 mt-1 leading-relaxed">
                {previewError || 'This invite may have expired or been revoked.'}
              </p>
            </div>
            <Link href="/" className="inline-block w-full">
              <Button variant="outline" className="w-full text-xs border-white/[0.08]">
                Return to Nexus Home
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Header / Server Branding */}
            <div className="flex flex-col items-center">
              <div className="relative mb-3">
                <Avatar
                  src={preview.icon_url}
                  name={preview.name}
                  size="lg"
                  className="w-16 h-16 rounded-2xl border-2 border-white/[0.08] shadow-xl text-lg font-bold"
                />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
              </div>

              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                You&apos;ve Been Invited to Join
              </div>
              <h1 className="text-xl font-bold tracking-tight text-foreground truncate max-w-[280px]">
                {preview.name}
              </h1>

              <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground/80 font-mono">
                <Users className="w-3.5 h-3.5 text-primary" />
                <span>{preview.member_count} {preview.member_count === 1 ? 'member' : 'members'}</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-2 pt-2">
              {user ? (
                <Button
                  onClick={handleAcceptInvite}
                  disabled={joining}
                  className="w-full h-11 text-xs font-semibold gap-2 shadow-glow-sm"
                >
                  {joining ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Joining Squad...</span>
                    </>
                  ) : isAlreadyMember ? (
                    <>
                      <span>Open Server</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      <span>Accept Invitation</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              ) : (
                <>
                  <Link
                    href={`/login?redirectTo=/invite/${encodeURIComponent(code)}`}
                    className="block w-full"
                  >
                    <Button className="w-full h-11 text-xs font-semibold gap-2 shadow-glow-sm">
                      <span>Sign In to Accept Invite</span>
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>

                  <Link
                    href={`/register?redirectTo=/invite/${encodeURIComponent(code)}`}
                    className="block w-full"
                  >
                    <Button variant="outline" className="w-full h-9 text-xs border-white/[0.08] hover:bg-white/[0.04]">
                      Create a Nexus Account
                    </Button>
                  </Link>
                </>
              )}
            </div>

            <div className="text-[11px] text-muted-foreground/60">
              Nexus Gaming Platform &bull; Squad Voice, Chat & Gaming Lounge
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
