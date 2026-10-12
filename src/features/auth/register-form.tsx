'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, User, AtSign, Gamepad2, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from './auth-provider';
import { registerSchema, RegisterFormData } from '@/lib/validation/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

export function RegisterForm() {
  const router = useRouter();
  const { signUpWithPassword, user } = useAuth();
  const { toast } = useToast();

  React.useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  const [formData, setFormData] = React.useState<RegisterFormData>({
    username: '',
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

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
          title: 'Registration Error',
          description: error,
          type: 'error',
        });
      } else if (emailConfirmationRequired) {
        setConfirmationSent(true);
      } else {
        toast({
          title: 'Account Created!',
          description: `Welcome aboard, ${formData.displayName}!`,
          type: 'success',
        });
        router.push('/');
      }
    } catch (err: unknown) {
      setGeneralError('An unexpected error occurred during registration.');
    } finally {
      setLoading(false);
    }
  };

  if (confirmationSent) {
    return (
      <div className="w-full max-w-md mx-auto p-8 rounded-2xl bg-card/90 border border-border shadow-2xl backdrop-blur-xl text-center">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Check Your Email</h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          We&apos;ve sent a confirmation link to <span className="text-foreground font-semibold">{formData.email}</span>.
          Please click the link in your email to verify your gaming account.
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
    <div className="w-full max-w-md mx-auto p-5 sm:p-8 rounded-2xl bg-card/90 border border-border shadow-2xl backdrop-blur-xl">
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary mb-3 shadow-glow-sm">
          <Gamepad2 className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Create Nexus Account</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Join your friends in low-latency voice, video & chat
        </p>
      </div>

      {generalError && (
        <div className="mb-5 p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-sm font-medium">
          {generalError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label htmlFor="reg-displayName" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Display Name
          </label>
          <Input
            id="reg-displayName"
            type="text"
            placeholder="GhostRider"
            value={formData.displayName}
            onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
            icon={<User className="w-4 h-4" />}
            disabled={loading}
          />
          {errors.displayName && <p className="text-xs text-rose-400 mt-1">{errors.displayName}</p>}
        </div>

        <div>
          <label htmlFor="reg-username" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Unique Username (@)
          </label>
          <Input
            id="reg-username"
            type="text"
            placeholder="ghost_rider"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            icon={<AtSign className="w-4 h-4" />}
            disabled={loading}
          />
          {errors.username && <p className="text-xs text-rose-400 mt-1">{errors.username}</p>}
        </div>

        <div>
          <label htmlFor="reg-email" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Email Address
          </label>
          <Input
            id="reg-email"
            type="email"
            placeholder="rider@nexus.gg"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            icon={<Mail className="w-4 h-4" />}
            disabled={loading}
          />
          {errors.email && <p className="text-xs text-rose-400 mt-1">{errors.email}</p>}
        </div>

        <div>
          <label htmlFor="reg-password" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Password (Min 8 chars, 1 uppercase, 1 number)
          </label>
          <Input
            id="reg-password"
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
          <label htmlFor="reg-confirmPassword" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Confirm Password
          </label>
          <Input
            id="reg-confirmPassword"
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

        <Button type="submit" className="w-full mt-3" size="lg" disabled={loading}>
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating Account...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              Complete Registration <ArrowRight className="w-4 h-4" />
            </span>
          )}
        </Button>
      </form>

      <div className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="text-primary hover:underline font-semibold">
          Log in
        </Link>
      </div>
    </div>
  );
}
