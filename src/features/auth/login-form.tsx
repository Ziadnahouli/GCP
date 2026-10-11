'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Gamepad2, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { useAuth } from './auth-provider';
import { loginSchema, LoginFormData } from '@/lib/validation/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

export function LoginForm() {
  const router = useRouter();
  const { signInWithPassword, user } = useAuth();
  const { toast } = useToast();

  React.useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  const [formData, setFormData] = React.useState<LoginFormData>({
    email: '',
    password: '',
  });
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
        router.push('/');
      }
    } catch {
      setGeneralError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-5 sm:p-8 rounded-2xl bg-card/90 border border-border shadow-2xl backdrop-blur-xl">
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary mb-3 shadow-glow-sm">
          <Gamepad2 className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome to Nexus</h1>
        <p className="text-sm text-muted-foreground mt-1">
          High-performance gaming voice, video & squad chat
        </p>
      </div>

      {generalError && (
        <div className="mb-6 p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-sm font-medium">
          {generalError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Email Address
          </label>
          <Input
            type="email"
            placeholder="your-email@nexus.gg"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            icon={<Mail className="w-4 h-4" />}
            disabled={loading}
          />
          {errors.email && <p className="text-xs text-rose-400 mt-1">{errors.email}</p>}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-primary hover:underline hover:text-primary-hover font-medium"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            type="password"
            placeholder="••••••••••••"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            icon={<Lock className="w-4 h-4" />}
            disabled={loading}
          />
          {errors.password && <p className="text-xs text-rose-400 mt-1">{errors.password}</p>}
        </div>

        <Button type="submit" className="w-full mt-2" size="lg" disabled={loading}>
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Signing In...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              Sign In <ArrowRight className="w-4 h-4" />
            </span>
          )}
        </Button>
      </form>

      <div className="mt-8 text-center text-sm text-muted-foreground">
        Need an account?{' '}
        <Link href="/register" className="text-primary hover:underline font-semibold">
          Create one now
        </Link>
      </div>
    </div>
  );
}
