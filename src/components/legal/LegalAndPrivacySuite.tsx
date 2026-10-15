'use client';

import React from 'react';
import Link from 'next/link';

export const LegalAndPrivacySuite: React.FC = () => {
  return (
    <div className="min-h-screen bg-[var(--bg-app,#0d0f12)] text-[var(--text-primary,#f3f4f6)] py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto">
        {/* Navigation back */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--accent,#6366f1)] hover:underline"
          >
            ← Back to App
          </Link>
        </div>

        <div className="border-b border-[var(--border-subtle,#242c38)] pb-6 mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight">Legal & Privacy Governance</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary,#9ca3af)]">
            Transparent breakdown of our ZeroTier mesh architecture, WebRTC peer data handling, and regulatory compliance (GDPR/CCPA).
          </p>
        </div>

        {/* Section 1: Privacy Policy */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4 text-[var(--accent,#6366f1)]">
            1. Privacy Policy & Direct P2P Architecture
          </h2>
          <p className="text-sm text-[var(--text-secondary,#9ca3af)] leading-relaxed mb-4">
            Our service operates on a direct peer-to-peer (P2P) mesh model integrated with ZeroTier networking. Audio, video, and screen-sharing data streams route point-to-point directly between client peers through encrypted DTLS/SRTP sessions. We do not inspect, intercept, record, or store the contents of your real-time voice, video, or data communications on our servers.
          </p>
          <div className="p-4 rounded-xl bg-[var(--bg-surface,#181d25)] border border-[var(--border-subtle,#242c38)] space-y-3 text-xs text-[var(--text-secondary,#9ca3af)]">
            <div>
              • <strong className="text-[var(--text-primary,#f3f4f6)]">Peer ICE Candidates:</strong> Your local and public IP addresses are temporarily exchanged through the signaling server strictly to establish direct peer-to-peer connectivity, then purged from volatile memory.
            </div>
            <div>
              • <strong className="text-[var(--text-primary,#f3f4f6)]">Zero Data Brokering:</strong> We do not sell, rent, or monetize user identifiers, telemetry logs, or network topologies to advertisers.
            </div>
            <div>
              • <strong className="text-[var(--text-primary,#f3f4f6)]">GDPR & CCPA Rights:</strong> Users have the right to request full export or deletion of account metadata at any time.
            </div>
            <div>
              • <strong className="text-[var(--text-primary,#f3f4f6)]">Local Device Encryption:</strong> Audio settings, theme preferences, and noise cancellation parameters remain strictly inside your browser’s local storage.
            </div>
          </div>
        </section>

        {/* Section 2: Terms of Service */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4 text-[var(--accent,#6366f1)]">
            2. Terms of Service & Acceptable Use
          </h2>
          <p className="text-sm text-[var(--text-secondary,#9ca3af)] leading-relaxed mb-4">
            By accessing this service, you agree not to use direct mesh networking to distribute malware, orchestrate distributed denial of service attacks (DDoS), or harass other participants. We retain the right to terminate signaling access and invalidate authentication tokens for accounts violating community safety standards.
          </p>
          <div className="p-4 rounded-xl bg-[var(--bg-surface,#181d25)] border border-[var(--border-subtle,#242c38)] space-y-2 text-xs text-[var(--text-secondary,#9ca3af)]">
            <div>
              • <strong className="text-[var(--text-primary,#f3f4f6)]">Service Availability:</strong> While we target 99.9% uptime for signaling coordination, direct P2P mesh performance relies on individual peer network environments, NAT configurations, and ISP routing.
            </div>
            <div>
              • <strong className="text-[var(--text-primary,#f3f4f6)]">Account Revocation:</strong> Malicious abuse of signaling sockets or automated spamming triggers immediate token blacklisting.
            </div>
          </div>
        </section>

        {/* Section 3: Preference Trigger */}
        <section className="pt-6 border-t border-[var(--border-subtle,#242c38)] flex items-center justify-between">
          <span className="text-xs text-[var(--text-muted,#6b7280)]">
            Need to change your privacy or telemetry choices?
          </span>
          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('open-cookie-consent'));
              }
            }}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--bg-surface-hover,#222935)] hover:bg-[var(--bg-surface-active,#2b3342)] border border-[var(--border-subtle,#242c38)] transition-all cursor-pointer"
          >
            Manage Data Preferences
          </button>
        </section>
      </div>
    </div>
  );
};

export default LegalAndPrivacySuite;
