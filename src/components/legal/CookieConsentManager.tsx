'use client';

import React, { useState, useEffect } from 'react';

export interface ConsentSettings {
  strictlyNecessary: boolean;
  p2pMeshRouting: boolean;
  functionalSettings: boolean;
  performanceTelemetry: boolean;
}

export const DEFAULT_CONSENT_SETTINGS: ConsentSettings = {
  strictlyNecessary: true,
  p2pMeshRouting: true,
  functionalSettings: true,
  performanceTelemetry: false,
};

export const CookieConsentManager: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<ConsentSettings>(DEFAULT_CONSENT_SETTINGS);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const stored =
        localStorage.getItem('veloq_consent_settings') ||
        localStorage.getItem('gcp_consent_settings');

      if (!stored) {
        setIsOpen(true);
      } else {
        setSettings(JSON.parse(stored));
      }
    } catch {
      setIsOpen(true);
    }

    // Listen to custom event to re-open consent settings from Settings Modal
    const handleReopen = () => setIsOpen(true);
    window.addEventListener('open-cookie-consent', handleReopen);
    return () => window.removeEventListener('open-cookie-consent', handleReopen);
  }, []);

  const saveSettings = (newSettings: ConsentSettings) => {
    setSettings(newSettings);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('veloq_consent_settings', JSON.stringify(newSettings));
      localStorage.setItem('gcp_consent_settings', JSON.stringify(newSettings));
    }
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cookie-consent-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="w-full max-w-xl p-6 rounded-2xl bg-[var(--bg-surface,#181d25)] border border-[var(--border-subtle,#242c38)] text-[var(--text-primary,#f3f4f6)] shadow-2xl">
        <h2 id="cookie-consent-title" className="text-xl font-bold mb-2">
          Privacy & Peer-to-Peer Data Preferences
        </h2>
        <p className="text-sm text-[var(--text-secondary,#9ca3af)] mb-6">
          We use direct ZeroTier and WebRTC mesh channels. Transparent configuration of local browser storage and peer networking:
        </p>

        <div className="space-y-4 mb-6">
          {/* Strictly Necessary */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-surface-hover,#222935)]">
            <div className="pr-4">
              <div className="text-sm font-semibold">Essential Security & Auth</div>
              <div className="text-xs text-[var(--text-muted,#6b7280)]">
                Encrypted tokens and CSRF cookies. Required for session state.
              </div>
            </div>
            <input
              type="checkbox"
              checked
              disabled
              aria-label="Essential Security and Authentication (Required)"
              className="opacity-60 cursor-not-allowed accent-[var(--accent,#6366f1)] h-4 w-4 rounded"
            />
          </div>

          {/* WebRTC & ZeroTier P2P Routing */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-surface-hover,#222935)]">
            <div className="pr-4">
              <div className="text-sm font-semibold">WebRTC ICE & ZeroTier Peer Mesh</div>
              <div className="text-xs text-[var(--text-muted,#6b7280)]">
                Exchanges ephemeral local IP and ICE candidates for direct peer routing.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.p2pMeshRouting}
              onChange={(e) => setSettings({ ...settings, p2pMeshRouting: e.target.checked })}
              aria-label="WebRTC ICE and ZeroTier Peer Mesh"
              className="accent-[var(--accent,#6366f1)] h-4 w-4 rounded cursor-pointer"
            />
          </div>

          {/* Functional Settings */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-surface-hover,#222935)]">
            <div className="pr-4">
              <div className="text-sm font-semibold">Custom Themes & Audio DSP</div>
              <div className="text-xs text-[var(--text-muted,#6b7280)]">
                Saves noise gate, mic sensitivity, and active UI theme in localStorage.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.functionalSettings}
              onChange={(e) => setSettings({ ...settings, functionalSettings: e.target.checked })}
              aria-label="Custom Themes and Audio DSP Settings"
              className="accent-[var(--accent,#6366f1)] h-4 w-4 rounded cursor-pointer"
            />
          </div>

          {/* Telemetry */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-surface-hover,#222935)]">
            <div className="pr-4">
              <div className="text-sm font-semibold">Jitter & Quality Telemetry</div>
              <div className="text-xs text-[var(--text-muted,#6b7280)]">
                Anonymous packet loss diagnostics to improve audio codec tuning.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.performanceTelemetry}
              onChange={(e) => setSettings({ ...settings, performanceTelemetry: e.target.checked })}
              aria-label="Jitter and Quality Telemetry"
              className="accent-[var(--accent,#6366f1)] h-4 w-4 rounded cursor-pointer"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={() =>
              saveSettings({
                strictlyNecessary: true,
                p2pMeshRouting: true,
                functionalSettings: true,
                performanceTelemetry: true,
              })
            }
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--bg-surface-hover,#222935)] hover:bg-[var(--bg-surface-active,#2b3342)] text-[var(--text-primary,#f3f4f6)] border border-[var(--border-subtle,#242c38)] transition-all cursor-pointer"
          >
            Accept All
          </button>
          <button
            onClick={() => saveSettings(settings)}
            className="px-5 py-2 text-xs font-semibold rounded-lg bg-[var(--accent,#6366f1)] hover:opacity-90 text-white shadow-lg transition-all cursor-pointer"
          >
            Save Choices
          </button>
        </div>
      </div>
    </div>
  );
};
