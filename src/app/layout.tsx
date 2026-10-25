import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/features/auth/auth-provider';
import { ToastProvider } from '@/components/ui/toast';

import { THEME_META_COLORS } from '@/lib/design/colors';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  fallback: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
});

export const metadata: Metadata = {
  title: 'Nexus - Real-time Voice, Video & Community Platform',
  description:
    'Ultra-low latency voice, high-definition video, collaborative screen sharing, persistent messaging, and virtual LAN networking.',
  keywords: [
    'Nexus',
    'Voice Chat',
    'Video Calling',
    'Screen Sharing',
    'Community Platform',
    'WebRTC',
    'LiveKit',
    'ZeroTier',
    'Soundboard',
  ],
  authors: [{ name: 'Nexus Team' }],
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.ico',
    apple: '/favicon.ico',
  },
  openGraph: {
    title: 'Nexus - Real-time Voice, Video & Community Platform',
    description:
      'Ultra-low latency voice, high-definition video, collaborative screen sharing, persistent messaging, and virtual LAN networking.',
    type: 'website',
    siteName: 'Nexus',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_META_COLORS.light },
    { media: '(prefers-color-scheme: dark)', color: THEME_META_COLORS.dark },
  ],
};

const themeInitScript = `
(function() {
  try {
    var storedTheme = localStorage.getItem('nexus_theme_mode') || 'system';
    var isDark = storedTheme === 'dark' || (storedTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    var storedAccent = localStorage.getItem('nexus_accent') || 'violet';
    root.setAttribute('data-theme', storedAccent);

    var storedDensity = localStorage.getItem('nexus_density') || 'comfortable';
    root.setAttribute('data-density', storedDensity);

    var storedTextScale = localStorage.getItem('nexus_text_scale') || '100';
    root.setAttribute('data-text-scale', storedTextScale);

    var storedReduceMotion = localStorage.getItem('nexus_reduce_motion');
    if (storedReduceMotion === 'true') {
      root.setAttribute('data-reduce-motion', 'true');
    }
  } catch (e) {
    /* ignore theme init errors */
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans antialiased bg-background text-foreground min-h-screen selection:bg-primary-subtle selection:text-foreground">
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
