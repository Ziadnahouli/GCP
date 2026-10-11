import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/features/auth/auth-provider';
import { ToastProvider } from '@/components/ui/toast';

export const metadata: Metadata = {
  title: 'Nexus - Gaming Communication Platform',
  description:
    'High-performance gaming communication platform featuring ultra-low latency voice, video, screen sharing, persistent chat, and ZeroTier LAN networking.',
  keywords: [
    'Gaming',
    'Voice Chat',
    'Discord Alternative',
    'WebRTC',
    'LiveKit',
    'ZeroTier',
    'Screen Sharing',
    'Soundboard',
  ],
  authors: [{ name: 'Nexus Team' }],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="violet">
      <body className="font-sans antialiased bg-background text-foreground min-h-screen selection:bg-primary/30 selection:text-primary-foreground">
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
