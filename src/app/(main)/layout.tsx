'use client';

import * as React from 'react';
import { CallProvider } from '@/features/calls/call-context';
import { PresenceProvider } from '@/features/presence/presence-context';
import { ServerVoiceProvider } from '@/features/servers/server-voice-context';
import { ServersProvider } from '@/hooks/use-servers';
import { ConversationsProvider } from '@/hooks/use-conversations';
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts';
import { AppShell } from '@/components/layout/app-shell';

function MainLayoutContent({ children }: { children: React.ReactNode }) {
  useGlobalShortcuts();
  return <AppShell>{children}</AppShell>;
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense
      fallback={
        <div className="h-dvh w-full flex items-center justify-center bg-background text-muted-foreground text-sm font-medium">
          Loading Nexus Platform...
        </div>
      }
    >
      <PresenceProvider>
        <CallProvider>
          <ServersProvider>
            <ConversationsProvider>
              <ServerVoiceProvider>
                <MainLayoutContent>{children}</MainLayoutContent>
              </ServerVoiceProvider>
            </ConversationsProvider>
          </ServersProvider>
        </CallProvider>
      </PresenceProvider>
    </React.Suspense>
  );
}
