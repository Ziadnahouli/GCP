'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, ArrowRight, Loader2, KeyRound } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase/client';
import { resetPasswordSchema, ResetPasswordFormData } from '@/lib/validation/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

export function ResetPasswordForm() {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = React.useMemo(() => getBrowserClient(), []);

  const [formData, setFormData] = React.useState<ResetPasswordFormData>({
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = React.useState<Partial<Record<keyof ResetPasswordFormData, string>>>({});
  const [loading, setLoading] = React.useState(false);
  const [generalError, setGeneralError] = React.useState<string | null>(null);
  const [sessionReady, setSessionReady] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let mounted = true;

    // 1. Check if URL contains hash params (#access_token=...&refresh_token=...)
    if (typeof window !== 'undefined' && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      if (accessToken && refreshToken) {
        supabase.auth
          .setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          .then(({ data, error }) => {
            if (!mounted) return;
            if (!error && data?.session) {
              setSessionReady(true);
              setGeneralError(null);
            }
          });
      }
    }

    // 2. Check if URL contains ?code= (direct PKCE redirect)
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      if (code) {
        supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
          if (!mounted) return;
          if (error) {
            console.error('[ResetPassword] Code exchange error:', error);
            setGeneralError('Invalid or expired password reset link. Please request a new one.');
            setSessionReady(false);
          } else {
            setSessionReady(true);
          }
        });
      } else {
        // 3. Check existing session
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!mounted) return;
          setSessionReady(!!session);
        });
      }
    }

    // 3. Listen for auth changes (PASSWORD_RECOVERY event)
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY' || !!session) {
        setSessionReady(true);
        setGeneralError(null);
      }
    });

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    const result = resetPasswordSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof ResetPasswordFormData, string>> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as keyof ResetPasswordFormData] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      const { error: updateErr } = await supabase.auth.updateUser({
        password: formData.password,
      });

      if (updateErr) {
        const errorMsg = updateErr.message?.toLowerCase().includes('auth session missing')
          ? 'Recovery session expired or not authenticated. Please request a fresh reset link from the sign in page.'
          : updateErr.message;
        setGeneralError(errorMsg);
        toast({
          title: 'Update Failed',
          description: errorMsg,
          type: 'error',
        });
      } else {
        toast({
          title: 'Password Updated',
          description: 'Your password has been changed. Please sign in.',
          type: 'success',
        });
        router.push('/login');
      }
    } catch {
      setGeneralError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto p-6 sm:p-8 rounded-2xl bg-surface-panel border border-white/[0.08] shadow-2xl shadow-black/90">
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary mb-3">
          <KeyRound className="w-5 h-5" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Set New Password</h1>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Enter and confirm your new secure gaming credentials
        </p>
      </div>

      {generalError && (
        <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
          {generalError}
        </div>
      )}

      {sessionReady === false && !generalError && (
        <div className="mb-5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium">
          Note: Please ensure you open this page by clicking the verification link received in your email.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="reset-password" className="block text-xs font-medium text-muted-foreground/80 mb-1.5">
            New Password
          </label>
          <Input
            id="reset-password"
            type="password"
            placeholder="••••••••••••"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            icon={<Lock className="w-4 h-4" />}
            disabled={loading}
            className="bg-white/[0.02] border-white/[0.08] text-xs"
          />
          {errors.password && <p className="text-xs text-rose-400 mt-1">{errors.password}</p>}
        </div>

        <div>
          <label htmlFor="reset-confirmPassword" className="block text-xs font-medium text-muted-foreground/80 mb-1.5">
            Confirm New Password
          </label>
          <Input
            id="reset-confirmPassword"
            type="password"
            placeholder="••••••••••••"
            value={formData.confirmPassword}
            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
            icon={<Lock className="w-4 h-4" />}
            disabled={loading}
            className="bg-white/[0.02] border-white/[0.08] text-xs"
          />
          {errors.confirmPassword && (
            <p className="text-xs text-rose-400 mt-1">{errors.confirmPassword}</p>
          )}
        </div>

        <Button type="submit" className="w-full mt-2 font-medium text-xs h-10" size="lg" disabled={loading}>
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Updating...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              Save New Password <ArrowRight className="w-4 h-4" />
            </span>
          )}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <Link
          href="/login"
          className="text-xs text-muted-foreground/70 hover:text-foreground font-medium transition-colors"
        >
          Cancel and Return to Sign In
        </Link>
      </div>
    </div>
  );
}
