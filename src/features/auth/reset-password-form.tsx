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
        setGeneralError(updateErr.message);
        toast({
          title: 'Update Failed',
          description: updateErr.message,
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
    <div className="w-full max-w-md mx-auto p-8 rounded-2xl bg-card/90 border border-border shadow-2xl backdrop-blur-xl">
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary mb-3 shadow-glow-sm">
          <KeyRound className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Set New Password</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enter and confirm your new secure gaming credentials
        </p>
      </div>

      {generalError && (
        <div className="mb-5 p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-sm font-medium">
          {generalError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="reset-password" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
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
          />
          {errors.password && <p className="text-xs text-rose-400 mt-1">{errors.password}</p>}
        </div>

        <div>
          <label htmlFor="reset-confirmPassword" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
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
          />
          {errors.confirmPassword && (
            <p className="text-xs text-rose-400 mt-1">{errors.confirmPassword}</p>
          )}
        </div>

        <Button type="submit" className="w-full mt-2" size="lg" disabled={loading}>
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
          className="text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
        >
          Cancel and Return to Sign In
        </Link>
      </div>
    </div>
  );
}
