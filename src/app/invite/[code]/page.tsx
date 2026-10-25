'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Users, Gamepad2, ArrowRight, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/features/auth/auth-provider';
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

  const [isAlreadyMember, setIsAlreadyMember] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    if (user?.id && preview?.server_id) {
      const supabase = getBrowserClient();
      supabase
        .from('server_members')
        .select('server_id')
        .eq('server_id', preview.server_id)
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (active && data) {
            setIsAlreadyMember(true);
          }
        });
    }
    return () => {
      active = false;
    };
  }, [user?.id, preview?.server_id]);

  const handleAcceptInvite = async () => {
    if (!user) {
      router.push(`/login?redirectTo=/invite/${encodeURIComponent(code)}`);
      return;
    }

    if (isAlreadyMember && preview?.server_id) {
      router.push(`/?s=${preview.server_id}`);
      return;
    }

    setJoining(true);
    try {
      const supabase = getBrowserClient();
      const { data: joinRes, error: joinErr } = await supabase.rpc('join_server_with_invite', {
        p_code: code.trim(),
      });

      if (joinErr) {
        toast({
          title: 'Join Failed',
          description: joinErr.message || 'Failed to join server.',
          type: 'error',
        });
        return;
      }

      const resData = joinRes as { id?: string; server_id?: string } | null;
      const joinedServerId = resData?.id || resData?.server_id || preview?.server_id;
      toast({
        title: 'Joined Server!',
        description: `Welcome to ${preview?.name || 'the server'}!`,
        type: 'success',
      });
      router.push(joinedServerId ? `/?s=${joinedServerId}` : '/');
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
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background">
      {/* Main card */}
      <div className="w-full max-w-[400px] mx-auto p-6 sm:p-8 rounded-dialog bg-card border border-border shadow-dialog text-center animate-in zoom-in-95 duration-150">
        {loadingPreview ? (
          <div className="py-8 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Loading server invitation...</p>
          </div>
        ) : previewError || !preview ? (
          <div className="space-y-4">
            <div className="w-10 h-10 rounded-xl bg-danger/10 border border-danger/25 flex items-center justify-center text-danger mx-auto">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Invite unavailable</h2>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                {previewError || 'This invite may have expired, been revoked, or reached maximum uses.'}
              </p>
            </div>
            <div className="pt-2">
              <Link href="/" className="inline-block w-full">
                <Button variant="outline" className="w-full text-xs font-medium h-9">
                  Return to Nexus home
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Header / Server Branding */}
            <div className="flex flex-col items-center">
              <div className="relative mb-3">
                <Avatar
                  src={preview.icon_url}
                  name={preview.name}
                  size="64"
                  className="w-16 h-16 rounded-2xl border border-border text-base font-semibold"
                />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-success/20 border border-success/40 flex items-center justify-center text-success">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
              </div>

              <div className="text-xs text-muted-foreground mb-1 font-medium">
                You have been invited to join
              </div>
              <h1 className="text-xl font-bold tracking-tight text-foreground truncate max-w-[280px]">
                {preview.name}
              </h1>

              <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
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
                  isLoading={joining}
                  className="w-full h-9 text-xs font-medium gap-2"
                >
                  {isAlreadyMember ? (
                    <>
                      <span>Open server</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      <span>Join server</span>
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
                    <Button className="w-full h-9 text-xs font-medium gap-2">
                      <span>Sign in to accept invite</span>
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>

                  <Link
                    href={`/register?redirectTo=/invite/${encodeURIComponent(code)}`}
                    className="block w-full"
                  >
                    <Button variant="outline" className="w-full h-9 text-xs font-medium">
                      Create an account
                    </Button>
                  </Link>
                </>
              )}
            </div>

            <div className="text-xs text-muted-foreground pt-1">
              Nexus &bull; Voice, video & persistent chat
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

