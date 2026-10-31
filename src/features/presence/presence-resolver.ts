export type UserStatus = 'online' | 'idle' | 'dnd' | 'offline' | 'unknown';

export interface PresenceEntry {
  status: UserStatus;
  timestamp?: number;
  device?: string;
}

/**
 * Resolves multiple presence entries for the same user across sessions/devices.
 *
 * Deterministic resolution rules (Section 2.2):
 * 1. An explicit 'dnd' (Do Not Disturb) preference wins across all sessions.
 * 2. 'online' beats 'idle' across sessions (an active phone or active tab keeps the user online).
 * 3. Resolves to 'idle' only when all active sessions are idle.
 * 4. Resolves to 'offline' if there are no active sessions (or all are offline/empty).
 */
export function resolveMultiSourcePresence(entries: PresenceEntry[]): UserStatus {
  if (!entries || entries.length === 0) {
    return 'offline';
  }

  // Filter out invalid/empty/unknown statuses and offline entries
  const activeEntries = entries.filter(
    (e) => e && e.status && e.status !== 'offline' && e.status !== 'unknown'
  );

  if (activeEntries.length === 0) {
    return 'offline';
  }

  // 1. Explicit DND preference wins over everything
  if (activeEntries.some((e) => e.status === 'dnd')) {
    return 'dnd';
  }

  // 2. Online beats idle across sessions
  if (activeEntries.some((e) => e.status === 'online')) {
    return 'online';
  }

  // 3. If all active sessions are idle
  if (activeEntries.every((e) => e.status === 'idle')) {
    return 'idle';
  }

  return 'offline';
}
