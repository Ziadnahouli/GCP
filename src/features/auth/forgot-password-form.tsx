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

      const redirectTo = `${window.location.origin}/reset-password`;
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
      <div className="w-full max-w-md mx-auto p-8 rounded-2xl bg-card/90 border border-border shadow-2xl backdrop-blur-xl text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Check Your Inbox</h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          If an account exists for <span className="text-foreground font-semibold">{email}</span>,
          you will receive a password reset link shortly.
        </p>
        <Link href="/login">
          <Button variant="outline" className="w-full">
            Back to Sign In
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-8 rounded-2xl bg-card/90 border border-border shadow-2xl backdrop-blur-xl">
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary mb-3 shadow-glow-sm">
          <KeyRound className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Reset Password</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enter your registered email to receive recovery instructions
        </p>
      </div>

      {error && (
        <div className="mb-5 p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-sm font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Account Email
          </label>
          <Input
            type="email"
            placeholder="player@nexus.gg"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            icon={<Mail className="w-4 h-4" />}
            disabled={loading}
          />
        </div>

        <Button type="submit" className="w-full mt-2" size="lg" disabled={loading}>
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
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
        </Link>
      </div>
    </div>
  );
}
