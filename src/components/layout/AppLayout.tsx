'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { FloatingCallController } from '@/components/call/FloatingCallController';
import { GhostTeardownEngine } from '@/lib/webrtc/GhostTeardownEngine';
import { CookieConsentManager } from '@/components/legal/CookieConsentManager';

export const AppLayout: React.FC = () => {
  const { theme, setTheme, accent, setAccent } = useTheme();
  const [isInCall, setIsInCall] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  useEffect(() => {
    if (!isInCall) return;
    if (typeof window === 'undefined' || typeof RTCPeerConnection === 'undefined') return;

    let teardownEngine: GhostTeardownEngine | null = null;

    try {
      // PeerConnection and media stream configuration
      const mockPc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      teardownEngine = new GhostTeardownEngine({
        callId: 'call_live_7721',
        peerId: 'peer_node_99',
        signalingEndpoint: typeof window !== 'undefined' ? window.location.origin : 'https://api.veloq.gg',
        authToken: 'token_abc123',
        pc: mockPc,
        localStream: null,
        onCallTerminated: (reason) => {
          console.log('Call terminated cleanly:', reason);
          setIsInCall(false);
        },
      });
    } catch (err) {
      console.warn('Could not initialize GhostTeardownEngine in this environment:', err);
    }

    return () => {
      if (teardownEngine) {
        teardownEngine.destroy();
      }
    };
  }, [isInCall]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-app,#0d0f12)] text-[var(--text-primary,#f3f4f6)] font-sans">
      {/* 1. Server Rail */}
      <aside className="w-18 flex flex-col items-center py-4 gap-3 bg-[var(--bg-sidebar,#13171d)] border-r border-[var(--border-subtle,#242c38)] select-none">
        <div
          className="w-12 h-12 rounded-2xl bg-[var(--accent,#6366f1)] flex items-center justify-center font-black text-white shadow-lg cursor-pointer hover:rounded-xl transition-all"
          title="Veloq Hub"
        >
          V
        </div>
        <div className="w-8 h-[2px] bg-[var(--border-subtle,#242c38)] rounded-full" />
        <button
          type="button"
          className="w-12 h-12 rounded-3xl bg-[var(--bg-surface,#181d25)] hover:bg-[var(--bg-surface-hover,#222935)] flex items-center justify-center cursor-pointer transition-all border border-transparent hover:border-[var(--border-subtle,#242c38)]"
          title="Gaming Servers"
          aria-label="Gaming Servers"
        >
          🎮
        </button>
        <button
          type="button"
          className="w-12 h-12 rounded-3xl bg-[var(--bg-surface,#181d25)] hover:bg-[var(--bg-surface-hover,#222935)] flex items-center justify-center cursor-pointer transition-all border border-transparent hover:border-[var(--border-subtle,#242c38)]"
          title="Security & ZeroTier Mesh"
          aria-label="Security and ZeroTier Mesh"
        >
          🛡️
        </button>
      </aside>

      {/* 2. Channel & Control Navigation */}
      <aside className="w-60 flex flex-col justify-between p-3 bg-[var(--bg-surface,#181d25)] border-r border-[var(--border-subtle,#242c38)] select-none">
        <div>
          <div className="flex items-center justify-between mb-4 px-2">
            <span className="font-bold text-sm tracking-wide">VELOQ SQUAD</span>
            <span className="text-xs text-[var(--accent,#6366f1)] bg-[var(--bg-surface-hover,#222935)] px-2 py-0.5 rounded-full font-mono">
              11ms
            </span>
          </div>

          <div className="space-y-1">
            <div className="px-2 py-1.5 rounded-lg bg-[var(--bg-surface-hover,#222935)] text-xs font-semibold flex items-center gap-2 cursor-pointer text-[var(--text-primary,#f3f4f6)]">
              <span>🔊</span> Scrim Voice Lounge
            </div>
            <div className="px-2 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary,#9ca3af)] hover:bg-[var(--bg-surface-hover,#222935)] hover:text-[var(--text-primary,#f3f4f6)] flex items-center gap-2 cursor-pointer transition-all">
              <span>💬</span> Strategy Briefing
            </div>
          </div>
        </div>

        {/* User Badge / Quick Theme Adjustments */}
        <div className="p-2 rounded-xl bg-[var(--bg-app,#0d0f12)] border border-[var(--border-subtle,#242c38)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[var(--accent,#6366f1)] flex items-center justify-center text-xs font-bold text-white shadow-sm">
              JD
            </div>
            <div className="text-xs">
              <div className="font-semibold leading-tight">Commander</div>
              <div className="text-[10px] text-[var(--success,#10b981)] font-medium">Connected</div>
            </div>
          </div>
          <button
            onClick={() => {
              const themeOrder: ('dark' | 'oled' | 'light' | 'high-contrast')[] = [
                'dark',
                'oled',
                'light',
                'high-contrast',
              ];
              const nextIndex = (themeOrder.indexOf(theme) + 1) % themeOrder.length;
              setTheme(themeOrder[nextIndex]);
            }}
            className="text-xs p-1.5 rounded-lg bg-[var(--bg-surface,#181d25)] hover:bg-[var(--bg-surface-hover,#222935)] border border-[var(--border-subtle,#242c38)] cursor-pointer transition-all"
            title={`Current Theme: ${theme}. Click to cycle.`}
            aria-label="Cycle Theme"
          >
            🎨
          </button>
        </div>
      </aside>

      {/* 3. Main Stage / Grid */}
      <main className="flex-1 flex flex-col items-center justify-center relative p-6">
        <div className="w-full max-w-4xl h-96 rounded-2xl bg-[var(--bg-surface,#181d25)] border border-[var(--border-subtle,#242c38)] flex flex-col items-center justify-center shadow-xl p-8 text-center">
          <div className="text-4xl mb-4 animate-bounce">🎙️</div>
          <div className="text-lg font-bold text-[var(--text-primary,#f3f4f6)]">
            Low Latency ZeroTier Voice Stage Active
          </div>
          <p className="text-xs text-[var(--text-muted,#6b7280)] mt-1 max-w-md">
            Direct DTLS/SRTP audio streaming via ZeroTier mesh route. Zero hops, peer-to-peer encryption, zero central voice recording.
          </p>

          <div className="mt-6 flex flex-wrap gap-2 items-center justify-center">
            {(['indigo', 'cyan', 'emerald', 'crimson', 'amber', 'silver'] as const).map((clr) => (
              <button
                key={clr}
                onClick={() => setAccent(clr)}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-all cursor-pointer ${
                  accent === clr
                    ? 'border-[var(--accent,#6366f1)] bg-[var(--bg-surface-hover,#222935)] text-white shadow-sm'
                    : 'border-[var(--border-subtle,#242c38)] text-[var(--text-secondary,#9ca3af)] hover:border-gray-500'
                }`}
              >
                {clr}
              </button>
            ))}
          </div>

          {!isInCall && (
            <button
              onClick={() => setIsInCall(true)}
              className="mt-6 px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--accent,#6366f1)] text-white hover:opacity-90 shadow-md transition-all cursor-pointer"
            >
              Reconnect Voice Stage
            </button>
          )}
        </div>

        {/* Floating Call Widget / PiP */}
        {isInCall && (
          <FloatingCallController
            localStream={null}
            remotePeerName="Commander"
            isMuted={isMuted}
            isCameraOff={isCameraOff}
            isScreenSharing={isScreenSharing}
            onToggleMic={() => setIsMuted(!isMuted)}
            onToggleCamera={() => setIsCameraOff(!isCameraOff)}
            onToggleScreenShare={() => setIsScreenSharing(!isScreenSharing)}
            onEndCall={() => setIsInCall(false)}
          />
        )}
      </main>

      {/* Cookie / Privacy Consent Modal */}
      <CookieConsentManager />
    </div>
  );
};

export default AppLayout;
