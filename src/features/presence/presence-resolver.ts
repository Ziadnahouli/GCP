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
 * 1. Active sessions override offline.
 * 2. Recent deliberate status changes (newer timestamp by > 500ms) win over stale sessions.
 * 3. Ties or concurrent sessions (within 500ms) are broken by status priority (dnd > online > idle).
 * 4. If all sessions are offline (or list is empty), status resolves to 'offline'.
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

  // Sort by timestamp descending if there is a distinct time difference (> 500ms)
  // otherwise fallback to status priority (dnd > online > idle)
  activeEntries.sort((a, b) => {
    const timeA = a.timestamp || 0;
    const timeB = b.timestamp || 0;
    const timeDiff = timeB - timeA;
    if (Math.abs(timeDiff) > 500) {
      return timeDiff;
    }
    const priorityDiff = (STATUS_PRIORITY[b.status] || 0) - (STATUS_PRIORITY[a.status] || 0);
    if (priorityDiff !== 0) return priorityDiff;
    return timeDiff;
  });

  return activeEntries[0].status;
}
