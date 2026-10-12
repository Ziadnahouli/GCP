import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test the safe redirect sanitization logic
function getSafeRedirectUrl(target: string | null, origin: string): URL {
  if (!target || !target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) {
    return new URL('/', origin);
  }
  try {
    const candidate = new URL(target, origin);
    if (candidate.origin !== origin) {
      return new URL('/', origin);
    }
    return candidate;
  } catch {
    return new URL('/', origin);
  }
}

describe('Auth Callback Security & Sanitization (SEC-01, SEC-02)', () => {
  const origin = 'https://nexus.gg';

  it('allows safe relative path redirects', () => {
    expect(getSafeRedirectUrl('/channels/123', origin).href).toBe('https://nexus.gg/channels/123');
    expect(getSafeRedirectUrl('/profile?tab=settings', origin).href).toBe('https://nexus.gg/profile?tab=settings');
    expect(getSafeRedirectUrl('/', origin).href).toBe('https://nexus.gg/');
  });

  it('blocks open redirect attempts to external protocols and schemes', () => {
    // Protocol-relative URL
    expect(getSafeRedirectUrl('//evil.com', origin).href).toBe('https://nexus.gg/');
    expect(getSafeRedirectUrl('//attacker.org/steal-token', origin).href).toBe('https://nexus.gg/');

    // Backslash bypass
    expect(getSafeRedirectUrl('/\\evil.com', origin).href).toBe('https://nexus.gg/');

    // Absolute external URLs
    expect(getSafeRedirectUrl('https://evil.com', origin).href).toBe('https://nexus.gg/');
    expect(getSafeRedirectUrl('http://malicious.com/phish', origin).href).toBe('https://nexus.gg/');
    expect(getSafeRedirectUrl('javascript:alert(1)', origin).href).toBe('https://nexus.gg/');
  });

  it('safely falls back to root when target is null, empty, or whitespace', () => {
    expect(getSafeRedirectUrl(null, origin).href).toBe('https://nexus.gg/');
    expect(getSafeRedirectUrl('', origin).href).toBe('https://nexus.gg/');
    expect(getSafeRedirectUrl('   ', origin).href).toBe('https://nexus.gg/');
  });
});
