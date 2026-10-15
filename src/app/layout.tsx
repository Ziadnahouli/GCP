import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/features/auth/auth-provider';
import { ToastProvider } from '@/components/ui/toast';
import { ThemeProvider } from '@/context/ThemeContext';

export const metadata: Metadata = {
  title: 'Veloq • Ultra-Low Latency P2P Voice & Mesh Platform',
  description:
    'High-performance gaming and real-time communication platform featuring ultra-low latency WebRTC/ZeroTier voice, video, screen sharing, persistent chat, and Document Picture-in-Picture controls.',
  keywords: [
    'Gaming',
    'Voice Chat',
    'Discord Alternative',
    'WebRTC',
    'ZeroTier',
    'Document Picture-in-Picture',
    'Screen Sharing',
    'Soundboard',
  ],
  authors: [{ name: 'Veloq / GCP Engineering' }],
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
    <html lang="en" data-theme="dark" data-accent="indigo">
      <body className="font-sans antialiased bg-[var(--bg-app,#0d0f12)] text-[var(--text-primary,#f3f4f6)] min-h-screen selection:bg-[var(--accent,#6366f1)]/30 selection:text-[var(--text-primary,#f3f4f6)]">
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

