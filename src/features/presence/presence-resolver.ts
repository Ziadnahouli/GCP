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
 * 2. Active sessions override offline.
 * 3. Recent deliberate status changes (newer timestamp by > 1s) win over stale sessions.
 * 4. Ties are broken by status priority (dnd > online > idle).
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

  // If only one active entry exists, return it
  if (activeEntries.length === 1) {
    return activeEntries[0].status;
  }

  // Explicit 'dnd' (Do Not Disturb) takes highest precedence across any active session
  if (activeEntries.some((e) => e.status === 'dnd')) {
    return 'dnd';
  }

  // Sort by timestamp descending if there is a distinct time difference (> 1s)
  // otherwise fallback to status priority
  activeEntries.sort((a, b) => {
    const timeA = a.timestamp || 0;
    const timeB = b.timestamp || 0;
    const timeDiff = timeB - timeA;
    if (Math.abs(timeDiff) > 1000) {
      return timeDiff;
    }
    const priorityDiff = (STATUS_PRIORITY[b.status] || 0) - (STATUS_PRIORITY[a.status] || 0);
    if (priorityDiff !== 0) return priorityDiff;
    return timeDiff;
  });

  return activeEntries[0].status;
}
