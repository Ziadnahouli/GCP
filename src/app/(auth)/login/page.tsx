import { Metadata } from 'next';
import { LoginForm } from '@/features/auth/login-form';

export const metadata: Metadata = {
  title: 'Sign In - Nexus Gaming Platform',
  description: 'Log into your Nexus account to chat and call with your squad.',
};

export default function LoginPage() {
  return <LoginForm />;
}
