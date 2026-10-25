'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, Lock, User, AtSign, ArrowRight, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from './auth-provider';
import { registerSchema, RegisterFormData } from '@/lib/validation/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { getSafeRedirectUrl, consumePendingInvite } from '@/lib/auth/safe-redirect';

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signUpWithPassword, user } = useAuth();
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

  const [formData, setFormData] = React.useState<RegisterFormData>({
    username: '',
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [errors, setErrors] = React.useState<Partial<Record<keyof RegisterFormData, string>>>({});
  const [loading, setLoading] = React.useState(false);
  const [generalError, setGeneralError] = React.useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    const result = registerSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof RegisterFormData, string>> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as keyof RegisterFormData] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      const { error, emailConfirmationRequired } = await signUpWithPassword({
        email: formData.email,
        password: formData.password,
        username: formData.username.toLowerCase(),
        display_name: formData.displayName,
      });

      if (error) {
        setGeneralError(error);
        toast({
          title: 'Registration failed',
          description: error,
          type: 'error',
        });
      } else if (emailConfirmationRequired) {
        setConfirmationSent(true);
      } else {
        toast({
          title: 'Account created',
          description: `Welcome to Nexus, ${formData.displayName}!`,
          type: 'success',
        });
        router.push(getTargetUrl());
      }
    } catch {
      setGeneralError('An unexpected error occurred during registration.');
    } finally {
      setLoading(false);
    }
  };

  if (confirmationSent) {
    return (
      <div className="w-full max-w-[400px] mx-auto p-6 sm:p-8 rounded-dialog bg-card border border-border shadow-dialog text-center">
        <div className="w-10 h-10 rounded-xl bg-success/15 border border-success/30 flex items-center justify-center text-success mx-auto mb-3">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-foreground mb-1.5">Check your email</h2>
        <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
          We sent a verification link to <span className="text-foreground font-medium">{formData.email}</span>.
          Please click the link in your email to activate your Nexus account.
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
        <h1 className="text-xl font-bold tracking-tight text-foreground">Create an account</h1>
        <p className="text-xs text-muted-foreground mt-1">
          High-performance voice, persistent chat & squad lounge
        </p>
      </div>

      {generalError && (
        <div className="mb-4 p-3 rounded-card bg-danger/10 border border-danger/25 text-danger text-xs font-medium leading-relaxed">
          {generalError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label htmlFor="reg-displayName" className="block text-xs font-medium text-foreground mb-1.5">
            Display name
          </label>
          <Input
            id="reg-displayName"
            type="text"
            placeholder="GhostRider"
            value={formData.displayName}
            onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
            icon={<User className="w-4 h-4" />}
            disabled={loading}
            errorText={errors.displayName}
            autoComplete="name"
          />
        </div>

        <div>
          <label htmlFor="reg-username" className="block text-xs font-medium text-foreground mb-1.5">
            Username
          </label>
          <Input
            id="reg-username"
            type="text"
            placeholder="ghost_rider"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            icon={<AtSign className="w-4 h-4" />}
            disabled={loading}
            errorText={errors.username}
            helperText="Lowercase letters, numbers, and underscores"
            autoComplete="username"
          />
        </div>

        <div>
          <label htmlFor="reg-email" className="block text-xs font-medium text-foreground mb-1.5">
            Email address
          </label>
          <Input
            id="reg-email"
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
          <label htmlFor="reg-password" className="block text-xs font-medium text-foreground mb-1.5">
            Password
          </label>
          <Input
            id="reg-password"
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
          <label htmlFor="reg-confirmPassword" className="block text-xs font-medium text-foreground mb-1.5">
            Confirm password
          </label>
          <Input
            id="reg-confirmPassword"
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

        <p className="text-xs text-muted-foreground pt-1 leading-normal">
          By creating an account, you agree to the Terms of Service and Privacy Policy.
        </p>

        <Button
          type="submit"
          className="w-full mt-3 font-medium text-xs h-9"
          size="md"
          isLoading={loading}
          disabled={loading}
        >
          Create account <ArrowRight className="w-4 h-4 ml-1.5" />
        </Button>
      </form>

      <div className="mt-6 pt-4 border-t border-border text-center">
        <p className="text-xs text-muted-foreground">
          Already have an account?{' '}
          <Link
            href={
              searchParams.get('redirectTo')
                ? `/login?redirectTo=${encodeURIComponent(searchParams.get('redirectTo')!)}`
                : '/login'
            }
            className="text-primary hover:underline font-medium"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

