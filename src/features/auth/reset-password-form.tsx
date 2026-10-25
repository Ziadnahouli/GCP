'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';
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
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
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
        supabase.auth.exchangeCodeForSession(code).then(async ({ error }) => {
          if (!mounted) return;
          if (error) {
            // Check if callback already exchanged the code and set session
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              setSessionReady(true);
              setGeneralError(null);
              return;
            }
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
          title: 'Update failed',
          description: errorMsg,
          type: 'error',
        });
      } else {
        toast({
          title: 'Password updated',
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
    <div className="w-full max-w-[400px] mx-auto p-6 sm:p-8 rounded-dialog bg-card border border-border shadow-dialog text-left">
      {/* Header & Wordmark */}
      <div className="flex flex-col items-center text-center mb-6">
        <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg tracking-wider mb-3 select-none shadow-subtle">
          N
        </div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Set new password</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Enter and confirm your new secure password
        </p>
      </div>

      {generalError && (
        <div className="mb-4 p-3 rounded-card bg-danger/10 border border-danger/25 text-danger text-xs font-medium leading-relaxed">
          {generalError}
        </div>
      )}

      {sessionReady === false && !generalError && (
        <div className="mb-4 p-3 rounded-card bg-warning/10 border border-warning/25 text-warning text-xs font-medium leading-relaxed">
          Note: Please ensure you opened this page by clicking the recovery link sent to your email.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="reset-password" className="block text-xs font-medium text-foreground mb-1.5">
            New password
          </label>
          <Input
            id="reset-password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••••••"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            icon={<Lock className="w-4 h-4" />}
            disabled={loading}
            errorText={errors.password}
            helperText="Minimum 8 characters with numbers and uppercase"
            autoComplete="new-password"
            suffixSlot={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-muted-foreground hover:text-foreground p-1 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            }
          />
        </div>

        <div>
          <label htmlFor="reset-confirmPassword" className="block text-xs font-medium text-foreground mb-1.5">
            Confirm new password
          </label>
          <Input
            id="reset-confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            placeholder="••••••••••••"
            value={formData.confirmPassword}
            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
            icon={<Lock className="w-4 h-4" />}
            disabled={loading}
            errorText={errors.confirmPassword}
            autoComplete="new-password"
            suffixSlot={
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="text-muted-foreground hover:text-foreground p-1 transition-colors"
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            }
          />
        </div>

        <Button
          type="submit"
          className="w-full mt-2 font-medium text-xs h-9"
          size="md"
          isLoading={loading}
          disabled={loading}
        >
          Save new password <ArrowRight className="w-4 h-4 ml-1.5" />
        </Button>
      </form>

      <div className="mt-6 pt-4 border-t border-border text-center">
        <Link
          href="/login"
          className="text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
        >
          Return to sign in
        </Link>
      </div>
    </div>
  );
}

