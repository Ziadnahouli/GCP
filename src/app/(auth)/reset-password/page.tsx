import { Metadata } from 'next';
import { ResetPasswordForm } from '@/features/auth/reset-password-form';

export const metadata: Metadata = {
  title: 'Set New Password - Nexus Gaming Platform',
  description: 'Enter your new account password.',
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
