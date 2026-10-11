import { Metadata } from 'next';
import { RegisterForm } from '@/features/auth/register-form';

export const metadata: Metadata = {
  title: 'Create Account - Nexus Gaming Platform',
  description: 'Create your Nexus account to chat and call with your squad.',
};

export default function RegisterPage() {
  return <RegisterForm />;
}
