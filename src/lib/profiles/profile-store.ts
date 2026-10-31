'use client';

import * as React from 'react';
import { getBrowserClient } from '@/lib/supabase/client';
import { PublicProfile, ProfileCardData, ProfileLinkItem, UserBadgeItem } from '@/lib/types/profile';

interface CacheEntry {
  profile: PublicProfile;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60 * 1000; // 60 seconds stale-while-revalidate
const BATCH_DEBOUNCE_MS = 15;

class ProfileStore {
  private cache = new Map<string, CacheEntry>();
  private pendingIds = new Set<string>();
  private pendingPromises = new Map<string, Array<(p: PublicProfile | null) => void>>();
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(userId: string, profile: PublicProfile) => void>();

  public getCached(userId: string): PublicProfile | null {
    const entry = this.cache.get(userId);
    return entry ? entry.profile : null;
  }

  public isStale(userId: string): boolean {
    const entry = this.cache.get(userId);
    if (!entry) return true;
    return Date.now() - entry.fetchedAt > CACHE_TTL_MS;
  }

  public set(userId: string, profile: PublicProfile) {
    this.cache.set(userId, { profile, fetchedAt: Date.now() });
    this.notify(userId, profile);
  }

  public invalidate(userId: string) {
    this.cache.delete(userId);
  }

  public subscribe(listener: (userId: string, profile: PublicProfile) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(userId: string, profile: PublicProfile) {
    this.listeners.forEach((listener) => {
      try {
        listener(userId, profile);
      } catch (err) {
        console.error('[ProfileStore] Listener error:', err);
      }
    });
  }

  public async fetch(userId: string): Promise<PublicProfile | null> {
    if (!userId) return null;

    const cached = this.getCached(userId);
    if (cached && !this.isStale(userId)) {
      return cached;
    }

    return new Promise((resolve) => {
      if (!this.pendingPromises.has(userId)) {
        this.pendingPromises.set(userId, []);
      }
      this.pendingPromises.get(userId)!.push(resolve);
      this.pendingIds.add(userId);

      if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => {
          this.executeBatchFetch();
        }, BATCH_DEBOUNCE_MS);
      }
    });
  }

  private async executeBatchFetch() {
    this.batchTimer = null;
    const idsToFetch = Array.from(this.pendingIds);
    this.pendingIds.clear();

    if (idsToFetch.length === 0) return;

    const supabase = getBrowserClient();
    try {
      const { data, error } = await supabase.rpc('get_public_profiles', {
        p_user_ids: idsToFetch,
      });

      if (error) {
        console.warn('[ProfileStore] RPC get_public_profiles failed:', error);
      }

      const returnedProfiles: PublicProfile[] = data || [];
      const profileMap = new Map(returnedProfiles.map((p) => [p.id, p]));

      for (const id of idsToFetch) {
        const profile = profileMap.get(id) || null;
        if (profile) {
          this.set(id, profile);
        }
        const resolvers = this.pendingPromises.get(id);
        if (resolvers) {
          this.pendingPromises.delete(id);
          for (const resolve of resolvers) {
            resolve(profile);
          }
        }
      }
    } catch (err) {
      console.error('[ProfileStore] Batch fetch error:', err);
      for (const id of idsToFetch) {
        const resolvers = this.pendingPromises.get(id);
        if (resolvers) {
          this.pendingPromises.delete(id);
          for (const resolve of resolvers) {
            resolve(null);
          }
        }
      }
    }
  }
}

export const profileStore = new ProfileStore();

/**
 * Hook to retrieve a lean public profile with cached SWR and automatic batching.
 */
export function usePublicProfile(userId: string | null | undefined): {
  profile: PublicProfile | null;
  isLoading: boolean;
} {
  const [profile, setProfile] = React.useState<PublicProfile | null>(() => {
    return userId ? profileStore.getCached(userId) : null;
  });
  const [isLoading, setIsLoading] = React.useState<boolean>(() => {
    if (!userId) return false;
    return !profileStore.getCached(userId) || profileStore.isStale(userId);
  });

  React.useEffect(() => {
    if (!userId) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const cached = profileStore.getCached(userId);
    if (cached) {
      setProfile(cached);
      if (!profileStore.isStale(userId)) {
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(!cached);

    profileStore.fetch(userId).then((fetched) => {
      if (isMounted) {
        if (fetched) setProfile(fetched);
        setIsLoading(false);
      }
    });

    const unsubscribe = profileStore.subscribe((updatedId, updatedProfile) => {
      if (isMounted && updatedId === userId) {
        setProfile(updatedProfile);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [userId]);

  return { profile, isLoading };
}

/**
 * Hook to retrieve multiple public profiles in a single batched call.
 */
export function usePublicProfiles(userIds: string[]): {
  profiles: Map<string, PublicProfile>;
  isLoading: boolean;
} {
  const [profiles, setProfiles] = React.useState<Map<string, PublicProfile>>(() => {
    const map = new Map<string, PublicProfile>();
    for (const id of userIds) {
      const p = profileStore.getCached(id);
      if (p) map.set(id, p);
    }
    return map;
  });

  const [isLoading, setIsLoading] = React.useState<boolean>(true);

  const userIdsKey = userIds.join(',');

  React.useEffect(() => {
    if (userIds.length === 0) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    Promise.all(userIds.map((id) => profileStore.fetch(id))).then((results) => {
      if (isMounted) {
        const nextMap = new Map<string, PublicProfile>();
        for (const res of results) {
          if (res) nextMap.set(res.id, res);
        }
        setProfiles(nextMap);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userIdsKey]);

  return { profiles, isLoading };
}

/**
 * Fetches the full profile card (including server-resolved identity and privacy gating).
 */
export async function fetchProfileCard(
  userId: string,
  serverId?: string | null
): Promise<ProfileCardData | null> {
  const supabase = getBrowserClient();

  const [cardRes, badgesRes, linksRes] = await Promise.all([
    supabase.rpc('get_profile_card', {
      p_user_id: userId,
      p_server_id: serverId || null,
    }),
    supabase
      .from('user_badges')
      .select('badge_id, granted_at, is_hidden, badge:badge_id ( id, name, description, icon_url, category )')
      .eq('user_id', userId)
      .eq('is_hidden', false),
    supabase
      .from('profile_links')
      .select('id, user_id, label, url, position')
      .eq('user_id', userId)
      .order('position', { ascending: true }),
  ]);

  if (cardRes.error) {
    console.warn('[ProfileStore] Error fetching profile card:', cardRes.error);
    return null;
  }

  const rawRow = Array.isArray(cardRes.data) ? cardRes.data[0] : cardRes.data;
  if (!rawRow) return null;

  const badges: UserBadgeItem[] = (badgesRes.data || [])
    .filter((b: any) => b.badge)
    .map((b: any) => ({
      id: b.badge.id,
      name: b.badge.name,
      description: b.badge.description,
      icon_url: b.badge.icon_url,
      category: b.badge.category,
      granted_at: b.granted_at,
    }));

  const links: ProfileLinkItem[] = (linksRes.data || []).map((l: any) => ({
    id: l.id,
    user_id: l.user_id,
    label: l.label,
    url: l.url,
    position: l.position,
  }));

  const cardData: ProfileCardData = {
    ...rawRow,
    badges,
    links,
  };

  return cardData;
}

const usernameToIdCache = new Map<string, string>();

/**
 * Resolves a username to its corresponding profile userId for mention triggers.
 */
export async function fetchUserIdByUsername(username: string): Promise<string | null> {
  const clean = username.trim().toLowerCase().replace(/^@/, '');
  if (!clean) return null;

  if (usernameToIdCache.has(clean)) {
    return usernameToIdCache.get(clean)!;
  }

  const supabase = getBrowserClient();
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', clean)
    .maybeSingle();

  if (data?.id) {
    usernameToIdCache.set(clean, data.id);
    return data.id;
  }
  return null;
}
