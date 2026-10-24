export type UserStatus = 'online' | 'idle' | 'dnd' | 'offline';

const STATUS_PRIORITY: Record<UserStatus, number> = {
  dnd: 4,
  online: 3,
  idle: 2,
  offline: 1,
};

export interface PresenceEntry {
  status: UserStatus;
  timestamp?: number;
}

/**
 * Resolves multiple presence entries for the same user (e.g. multiple tabs,
 * desktop + mobile, or rapid reconnects) into a stable, single status.
 *
 * Conflict resolution priority:
 * 1. Explicit 'dnd' (Do Not Disturb) takes highest precedence across any active session.
 * 2. Active 'online' overrides 'idle' and 'offline'.
 * 3. 'idle' overrides 'offline'.
 * 4. Ties are broken by newest timestamp.
 * 5. If all sessions are offline (or list is empty), status resolves to 'offline'.
 */
export function resolveMultiSourcePresence(entries: PresenceEntry[]): UserStatus {
  if (!entries || entries.length === 0) {
    return 'offline';
  }

  // Filter out invalid/empty statuses
  const validEntries = entries.filter((e) => e && e.status);
  if (validEntries.length === 0) {
    return 'offline';
  }

  // Check if all are offline
  const activeEntries = validEntries.filter((e) => e.status !== 'offline');
  if (activeEntries.length === 0) {
    return 'offline';
  }

  // Sort active entries by priority descending, then timestamp descending
  activeEntries.sort((a, b) => {
    const priorityDiff = STATUS_PRIORITY[b.status] - STATUS_PRIORITY[a.status];
    if (priorityDiff !== 0) return priorityDiff;
    return (b.timestamp || 0) - (a.timestamp || 0);
  });

  return activeEntries[0].status;
}
