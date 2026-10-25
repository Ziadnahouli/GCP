/**
 * Safe redirect and invite code persistence helpers.
 * Ensures redirects only go to same-origin relative paths, preventing open redirect vulnerabilities.
 */

const PENDING_INVITE_STORAGE_KEY = 'nexus_pending_invite_code';

export function getSafeRedirectUrl(target: string | null | undefined, fallback: string = '/'): string {
  if (!target || typeof target !== 'string') {
    return fallback;
  }

  const trimmed = target.trim();
  // Must start with '/' and not '//' or '/\' which can trick browser resolution to external domains
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    trimmed.includes('\\')
  ) {
    return fallback;
  }

  try {
    // Validate with dummy origin to verify pathname remains relative
    const dummyOrigin = 'http://nexus-local.internal';
    const parsed = new URL(trimmed, dummyOrigin);
    if (parsed.origin !== dummyOrigin) {
      return fallback;
    }
    // Return pathname + search + hash
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function savePendingInvite(code: string): void {
  if (typeof window === 'undefined' || !code) return;
  try {
    sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, code.trim());
  } catch (err) {
    void err;
  }
}

export function getPendingInvite(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function consumePendingInvite(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const code = sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY);
    if (code) {
      sessionStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
    }
    return code;
  } catch {
    return null;
  }
}
