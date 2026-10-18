'use client';

import * as React from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, Loader2, CheckCircle2, KeyRound } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase/client';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { forgotPasswordSchema, ForgotPasswordFormData } from '@/lib/validation/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

export function ForgotPasswordForm() {
  const { toast } = useToast();
  const supabase = React.useMemo(() => getBrowserClient(), []);
  const config = React.useMemo(() => getSupabaseConfig(), []);

  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const result = forgotPasswordSchema.safeParse({ email });
    if (!result.success) {
      setError(result.error.errors[0]?.message || 'Invalid email');
      return;
    }

    setLoading(true);

    try {
      if (!config.isConfigured) {
        // Local simulation
        setSubmitted(true);
        toast({
          title: 'Reset Link Sent',
          description: 'Check your email inbox (simulated in local mode).',
          type: 'success',
        });
        return;
      }

      const redirectTo = `${window.location.origin}/callback?next=/reset-password`;
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (resetErr) {
        setError(resetErr.message);
        toast({
          title: 'Recovery Failed',
          description: resetErr.message,
          type: 'error',
        });
      } else {
        setSubmitted(true);
        toast({
          title: 'Reset Link Sent',
          description: 'A password recovery email has been sent.',
          type: 'success',
        });
      }
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="w-full max-w-sm mx-auto p-6 sm:p-8 rounded-2xl bg-surface-panel border border-white/[0.08] shadow-2xl shadow-black/90 text-center">
        <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary mx-auto mb-3">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-1">Check Your Inbox</h2>
        <p className="text-xs text-muted-foreground/70 mb-5 leading-relaxed font-normal">
          If an account exists for <span className="text-foreground font-medium">{email}</span>,
          you will receive a password reset link shortly.
        </p>
        <Link href="/login">
          <Button variant="outline" className="w-full border-white/[0.08] bg-white/[0.02] text-xs font-medium">
            Back to Sign In
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto p-6 sm:p-8 rounded-2xl bg-surface-panel border border-white/[0.08] shadow-2xl shadow-black/90">
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary mb-3">
          <KeyRound className="w-5 h-5" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Reset Password</h1>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Enter your registered email to receive recovery instructions
        </p>
      </div>

      {error && (
        <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="forgot-email" className="block text-xs font-medium text-muted-foreground/80 mb-1.5">
            Account Email
          </label>
          <Input
            id="forgot-email"
            type="email"
            placeholder="player@gcp.gg"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            icon={<Mail className="w-4 h-4" />}
            disabled={loading}
            className="bg-white/[0.02] border-white/[0.08] text-xs"
          />
        </div>

        <Button type="submit" className="w-full mt-2 font-medium text-xs h-10" size="lg" disabled={loading}>
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Sending instructions...
            </span>
          ) : (
            'Send Recovery Link'
          )}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-foreground font-medium transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
        </Link>
      </div>
    </div>
  );
}
