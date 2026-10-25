'use client';

import * as React from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase/client';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { forgotPasswordSchema } from '@/lib/validation/auth';
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
      setError(result.error.errors[0]?.message || 'Invalid email address');
      return;
    }

    setLoading(true);

    try {
      if (!config.isConfigured) {
        // Local simulation
        setSubmitted(true);
        toast({
          title: 'Reset link sent',
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
        let msg = resetErr.message;
        if (msg.toLowerCase().includes('rate limit')) {
          msg = 'Email rate limit exceeded (Supabase limits free mailer to 3 emails/hour). If you recently requested a reset link, please check your inbox (including spam) or wait a short while.';
        }
        setError(msg);
        toast({
          title: 'Recovery notice',
          description: msg,
          type: 'error',
        });
      } else {
        setSubmitted(true);
        toast({
          title: 'Reset link sent',
          description: 'A password recovery email has been sent.',
          type: 'success',
        });
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="w-full max-w-[400px] mx-auto p-6 sm:p-8 rounded-dialog bg-card border border-border shadow-dialog text-center">
        <div className="w-10 h-10 rounded-xl bg-success/15 border border-success/30 flex items-center justify-center text-success mx-auto mb-3">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-foreground mb-1.5">Check your inbox</h2>
        <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
          If an account exists for <span className="text-foreground font-medium">{email}</span>,
          you will receive a password reset link shortly.
        </p>
        <Link href="/login" className="block w-full">
          <Button variant="outline" className="w-full text-xs font-medium h-9">
            Back to sign in
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[400px] mx-auto p-6 sm:p-8 rounded-dialog bg-card border border-border shadow-dialog text-left">
      {/* Header & Wordmark */}
      <div className="flex flex-col items-center text-center mb-6">
        <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg tracking-wider mb-3 select-none shadow-subtle">
          N
        </div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Reset password</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Enter your registered email to receive recovery instructions
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-card bg-danger/10 border border-danger/25 text-danger text-xs font-medium leading-relaxed">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="forgot-email" className="block text-xs font-medium text-foreground mb-1.5">
            Email address
          </label>
          <Input
            id="forgot-email"
            type="email"
            placeholder="you@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            icon={<Mail className="w-4 h-4" />}
            disabled={loading}
            errorText={error || undefined}
            autoComplete="email"
          />
        </div>

        <Button
          type="submit"
          className="w-full mt-2 font-medium text-xs h-9"
          size="md"
          isLoading={loading}
          disabled={loading}
        >
          Send recovery link <ArrowRight className="w-4 h-4 ml-1.5" />
        </Button>
      </form>

      <div className="mt-6 pt-4 border-t border-border text-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
        </Link>
      </div>
    </div>
  );
}

