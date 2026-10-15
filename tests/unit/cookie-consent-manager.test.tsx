import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import * as React from 'react';
import { CookieConsentManager } from '@/components/legal/CookieConsentManager';

describe('CookieConsentManager - GDPR/CCPA Privacy & P2P Storage Governance', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('automatically opens modal if no prior consent is stored', () => {
    render(<CookieConsentManager />);

    expect(screen.getByText('Privacy & Peer-to-Peer Data Preferences')).toBeDefined();
    expect(screen.getByText('Essential Security & Auth')).toBeDefined();
    expect(screen.getByText('WebRTC ICE & ZeroTier Peer Mesh')).toBeDefined();
    expect(screen.getByText('Custom Themes & Audio DSP')).toBeDefined();
    expect(screen.getByText('Jitter & Quality Telemetry')).toBeDefined();
  });

  it('does not open modal if choices are already saved', () => {
    localStorage.setItem(
      'veloq_consent_settings',
      JSON.stringify({
        strictlyNecessary: true,
        p2pMeshRouting: true,
        functionalSettings: true,
        performanceTelemetry: false,
      })
    );

    render(<CookieConsentManager />);
    expect(screen.queryByText('Privacy & Peer-to-Peer Data Preferences')).toBeNull();
  });

  it('saves custom choices to localStorage when Save Choices is clicked', () => {
    render(<CookieConsentManager />);

    const telemetryCheckbox = screen.getByLabelText(/Jitter and Quality Telemetry/i) as HTMLInputElement;
    expect(telemetryCheckbox.checked).toBe(false);

    // Toggle telemetry ON
    fireEvent.click(telemetryCheckbox);
    expect(telemetryCheckbox.checked).toBe(true);

    const saveButton = screen.getByText('Save Choices');
    fireEvent.click(saveButton);

    // Modal closes
    expect(screen.queryByText('Privacy & Peer-to-Peer Data Preferences')).toBeNull();

    // Verify localStorage
    const saved = JSON.parse(localStorage.getItem('veloq_consent_settings') || '{}');
    expect(saved.performanceTelemetry).toBe(true);
    expect(saved.strictlyNecessary).toBe(true);
    expect(saved.p2pMeshRouting).toBe(true);
  });

  it('enables all permissions and closes when Accept All is clicked', () => {
    render(<CookieConsentManager />);

    const acceptAllButton = screen.getByText('Accept All');
    fireEvent.click(acceptAllButton);

    expect(screen.queryByText('Privacy & Peer-to-Peer Data Preferences')).toBeNull();

    const saved = JSON.parse(localStorage.getItem('veloq_consent_settings') || '{}');
    expect(saved.strictlyNecessary).toBe(true);
    expect(saved.p2pMeshRouting).toBe(true);
    expect(saved.functionalSettings).toBe(true);
    expect(saved.performanceTelemetry).toBe(true);
  });

  it('reopens modal when open-cookie-consent custom event is dispatched', () => {
    localStorage.setItem(
      'veloq_consent_settings',
      JSON.stringify({
        strictlyNecessary: true,
        p2pMeshRouting: true,
        functionalSettings: true,
        performanceTelemetry: true,
      })
    );

    render(<CookieConsentManager />);
    expect(screen.queryByText('Privacy & Peer-to-Peer Data Preferences')).toBeNull();

    act(() => {
      window.dispatchEvent(new CustomEvent('open-cookie-consent'));
    });

    expect(screen.getByText('Privacy & Peer-to-Peer Data Preferences')).toBeDefined();
  });
});
