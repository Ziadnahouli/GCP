import { Metadata } from 'next';
import { ForgotPasswordForm } from '@/features/auth/forgot-password-form';

export const metadata: Metadata = {
  title: 'Reset Password - Nexus Gaming Platform',
  description: 'Recover your account credentials.',
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
