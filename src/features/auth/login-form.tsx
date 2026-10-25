'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from './auth-provider';
import { loginSchema, LoginFormData } from '@/lib/validation/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { getSafeRedirectUrl, getPendingInvite, consumePendingInvite } from '@/lib/auth/safe-redirect';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signInWithPassword, user } = useAuth();
  const { toast } = useToast();

  const getTargetUrl = React.useCallback(() => {
    const rawRedirect = searchParams.get('redirectTo');
    if (rawRedirect) {
      return getSafeRedirectUrl(rawRedirect, '/');
    }
    const pendingInvite = consumePendingInvite();
    if (pendingInvite) {
      return `/invite/${pendingInvite}`;
    }
    return '/';
  }, [searchParams]);

  React.useEffect(() => {
    if (user) {
      router.push(getTargetUrl());
    }
  }, [user, router, getTargetUrl]);

  const [formData, setFormData] = React.useState<LoginFormData>({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = React.useState(false);
  const [errors, setErrors] = React.useState<Partial<Record<keyof LoginFormData, string>>>({});
  const [loading, setLoading] = React.useState(false);
  const [generalError, setGeneralError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    const result = loginSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof LoginFormData, string>> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as keyof LoginFormData] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      const { error } = await signInWithPassword(formData.email, formData.password);
      if (error) {
        setGeneralError(error);
        toast({
          title: 'Sign In Failed',
          description: error,
          type: 'error',
        });
      } else {
        toast({
          title: 'Welcome Back!',
          description: 'Successfully signed in to Nexus.',
          type: 'success',
        });
        router.push(getTargetUrl());
      }
    } catch {
      setGeneralError('An unexpected error occurred. Please try again.');
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
        <h1 className="text-xl font-bold tracking-tight text-foreground">Welcome to Nexus</h1>
        <p className="text-xs text-muted-foreground mt-1">
          High-performance voice, persistent chat & squad lounge
        </p>
      </div>

      {generalError && (
        <div className="mb-4 p-3 rounded-card bg-danger/10 border border-danger/25 text-danger text-xs font-medium leading-relaxed">
          {generalError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="block text-xs font-medium text-foreground mb-1.5">
            Email address
          </label>
          <Input
            id="login-email"
            type="email"
            placeholder="you@domain.com"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            icon={<Mail className="w-4 h-4" />}
            disabled={loading}
            errorText={errors.email}
            autoComplete="email"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="login-password" className="block text-xs font-medium text-foreground">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-primary hover:underline font-normal"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••••••"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              icon={<Lock className="w-4 h-4" />}
              disabled={loading}
              errorText={errors.password}
              autoComplete="current-password"
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
        </div>

        <Button
          type="submit"
          className="w-full mt-2 font-medium text-xs h-9"
          size="md"
          isLoading={loading}
          disabled={loading}
        >
          Sign in <ArrowRight className="w-4 h-4 ml-1.5" />
        </Button>
      </form>

      <div className="mt-6 pt-4 border-t border-border text-center">
        <p className="text-xs text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-primary hover:underline font-medium">
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}
