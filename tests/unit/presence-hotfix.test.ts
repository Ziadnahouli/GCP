import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolveMultiSourcePresence,
  PresenceEntry,
} from '@/features/presence/presence-resolver';
import { globalPresenceStore } from '@/features/presence/presence-context';

describe('Presence Hotfix: Resolver, Store & Fallback Elimination', () => {
  beforeEach(() => {
    globalPresenceStore.clear();
  });

  describe('Deterministic Multi-Session Resolver', () => {
    it('returns offline when entries are empty or all offline', () => {
      expect(resolveMultiSourcePresence([])).toBe('offline');
      expect(resolveMultiSourcePresence([{ status: 'offline' }])).toBe('offline');
      expect(
        resolveMultiSourcePresence([
          { status: 'offline', timestamp: Date.now() },
          { status: 'offline', timestamp: Date.now() - 1000 },
        ])
      ).toBe('offline');
    });

    it('online beats idle across multiple sessions regardless of timestamps', () => {
      // Background tab went idle recently, but mobile phone is active online
      const entries: PresenceEntry[] = [
        { status: 'idle', timestamp: Date.now() },
        { status: 'online', timestamp: Date.now() - 60000 },
      ];
      expect(resolveMultiSourcePresence(entries)).toBe('online');

      // Reverse order: online first, idle second
      const reverseEntries: PresenceEntry[] = [
        { status: 'online', timestamp: Date.now() - 60000 },
        { status: 'idle', timestamp: Date.now() },
      ];
      expect(resolveMultiSourcePresence(reverseEntries)).toBe('online');
    });

    it('explicit DND preference wins over online and idle', () => {
      const entries: PresenceEntry[] = [
        { status: 'online', timestamp: Date.now() },
        { status: 'dnd', timestamp: Date.now() - 5000 },
        { status: 'idle', timestamp: Date.now() - 10000 },
      ];
      expect(resolveMultiSourcePresence(entries)).toBe('dnd');
    });

    it('resolves to idle only when all active sessions are idle', () => {
      const entries: PresenceEntry[] = [
        { status: 'idle', timestamp: Date.now() },
        { status: 'idle', timestamp: Date.now() - 20000 },
      ];
      expect(resolveMultiSourcePresence(entries)).toBe('idle');
    });

    it('comparator is transitive and deterministic', () => {
      const e1: PresenceEntry = { status: 'idle', timestamp: 1000 };
      const e2: PresenceEntry = { status: 'online', timestamp: 2000 };
      const e3: PresenceEntry = { status: 'dnd', timestamp: 1500 };

      expect(resolveMultiSourcePresence([e1, e2])).toBe('online');
      expect(resolveMultiSourcePresence([e2, e3])).toBe('dnd');
      expect(resolveMultiSourcePresence([e1, e3])).toBe('dnd');
    });
  });

  describe('PresenceStore Unknown State and Reset', () => {
    it('returns unknown for an unsynced user before the store syncs', () => {
      expect(globalPresenceStore.isSynced()).toBe(false);
      expect(globalPresenceStore.getStatus('user-unknown-1')).toBe('unknown');
    });

    it('returns offline for an unknown user after the store has synced', () => {
      globalPresenceStore.setHasSynced(true);
      expect(globalPresenceStore.isSynced()).toBe(true);
      expect(globalPresenceStore.getStatus('user-unknown-2')).toBe('offline');
    });

    it('returns authoritative status when user exists in the store', () => {
      globalPresenceStore.setStatus('user-1', 'online');
      expect(globalPresenceStore.getStatus('user-1')).toBe('online');

      globalPresenceStore.setStatus('user-2', 'dnd');
      expect(globalPresenceStore.getStatus('user-2')).toBe('dnd');
    });

    it('clear() fully resets state and hasSynced on account switch or logout', () => {
      globalPresenceStore.setStatus('user-1', 'online');
      globalPresenceStore.setHasSynced(true);
      expect(globalPresenceStore.getStatus('user-1')).toBe('online');

      // Account switch or logout happens
      globalPresenceStore.clear();

      expect(globalPresenceStore.isSynced()).toBe(false);
      expect(globalPresenceStore.hasUser('user-1')).toBe(false);
      expect(globalPresenceStore.getStatus('user-1')).toBe('unknown');
    });
  });
});
