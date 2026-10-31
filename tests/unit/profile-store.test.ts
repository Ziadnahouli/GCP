// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { profileStore } from '@/lib/profiles/profile-store';
import { PublicProfile } from '@/lib/types/profile';

describe('ProfileStore Caching & Batching Pipeline', () => {
  beforeEach(() => {
    profileStore.invalidate('user-1');
    profileStore.invalidate('user-2');
  });

  const mockProfile1: PublicProfile = {
    id: 'user-1',
    username: 'alice',
    display_name: 'Alice Gamer',
    avatar_url: null,
    avatar_path: 'user-1/avatar.webp',
    avatar_color: '#3b82f6',
    decoration_id: 'neon_ring',
    status: 'online',
    custom_status: 'Coding',
    custom_status_emoji: '💻',
  };

  it('stores and retrieves cached public profiles without staleness initially', () => {
    profileStore.set('user-1', mockProfile1);

    expect(profileStore.getCached('user-1')).toEqual(mockProfile1);
    expect(profileStore.isStale('user-1')).toBe(false);

    profileStore.invalidate('user-1');
    expect(profileStore.getCached('user-1')).toBeNull();
    expect(profileStore.isStale('user-1')).toBe(true);
  });

  it('notifies subscribers on profile store updates', () => {
    const subscriber = vi.fn();
    const unsub = profileStore.subscribe(subscriber);

    profileStore.set('user-1', mockProfile1);

    expect(subscriber).toHaveBeenCalledWith('user-1', mockProfile1);
    unsub();

    profileStore.set('user-1', { ...mockProfile1, status: 'idle' });
    expect(subscriber).toHaveBeenCalledTimes(1);
  });
});

