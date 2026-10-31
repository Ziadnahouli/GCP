'use client';

import * as React from 'react';
import {
  Server,
  Channel,
  ChannelType,
  RoleDefinition,
  ServerPermission,
  ServerBan,
  ModerationAuditLog,
  ServerInvite,
  MutationResult,
  hasServerPermission,
  hasChannelPermission,
  ChannelPermissionOverride,
  ALL_SERVER_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
} from '@/lib/types/server';
import { useAuth } from '@/features/auth/auth-provider';
import { supabase } from '@/lib/supabase/client';
import { UserProfile } from '@/lib/types/profile';
import { realtimeHub } from '@/lib/realtime/realtime-hub';
import { globalPresenceStore } from '@/features/presence/presence-context';
import { DEFAULT_ROLE_COLORS } from '@/lib/design/colors';

const STORAGE_KEY = 'nexus_gaming_servers_store';

const DUMMY_SERVER_IDS = new Set([
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
]);

const DEFAULT_SERVERS: Server[] = [];

export function useServersInternal() {
  const { user, profile } = useAuth();
  // A8: Deterministic SSR initialization to avoid hydration mismatch
  const [servers, setServers] = React.useState<Server[]>(DEFAULT_SERVERS);
  const [loading, setLoading] = React.useState(false);
  const serversChannelRef = React.useRef<any>(null);

  const fetchServers = React.useCallback(async () => {
    if (!user || !supabase) return;
    try {
      const { data: srvData, error } = await supabase
        .from('servers')
        .select(`
          id, name, description, icon_url, owner_id, created_at,
          channels ( id, server_id, name, type, topic, position, created_at ),
          server_roles ( id, server_id, name, color, position, permissions, is_system, created_at ),
          server_members (
            id, server_id, user_id, role, role_id, joined_at, timeout_until,
            nickname, avatar_path, banner_path, bio, pronouns,
            profile:user_id (
              id, username, display_name, avatar_url, avatar_path, avatar_color, status
            )
          )
        `);

      if (!error && srvData) {
        const overridesByChannel = new Map<string, ChannelPermissionOverride[]>();
        try {
          const { data: overridesData } = await supabase
            .from('channel_permission_overrides')
            .select('id, channel_id, role_id, allow, deny');
          if (overridesData && Array.isArray(overridesData)) {
            for (const ov of overridesData as { id?: string; channel_id: string; role_id: string; allow: ServerPermission[]; deny: ServerPermission[] }[]) {
              const list = overridesByChannel.get(ov.channel_id) || [];
              list.push(ov);
              overridesByChannel.set(ov.channel_id, list);
            }
          }
        } catch {
          // Fallback if table not yet migrated
        }

        const parsed: Server[] = srvData
          .filter((s) => !DUMMY_SERVER_IDS.has(s.id))
          // Only show servers where user is the owner or an existing member
          .filter((s) => {
            const isOwner = s.owner_id === user.id;
            const isMember = (s.server_members || []).some((m: any) => m.user_id === user.id);
            return isOwner || isMember;
          })
          .map((s) => {
            // A5: Sort real channels directly; default channels are created in DB trigger
            const channels = (s.channels || [])
              .sort((a: Channel, b: Channel) => a.position - b.position)
              .map((c: Channel) => ({
                ...c,
                permission_overrides: overridesByChannel.get(c.id) || [],
              }));

            const rawRoles = (s.server_roles || []).sort((a: any, b: any) => b.position - a.position);
            const roles: RoleDefinition[] = rawRoles.map((r: any) => ({
              id: r.id,
              server_id: r.server_id,
              name: r.name,
              color: r.color,
              position: r.position,
              permissions: (r.permissions || []) as ServerPermission[],
              is_system: r.is_system,
              is_custom: !r.is_system,
            }));

            const effectiveRoles: RoleDefinition[] =
              roles.length > 0
                ? roles
                : [
                    {
                      id: `${s.id}-admin`,
                      server_id: s.id,
                      name: 'Admin',
                      color: DEFAULT_ROLE_COLORS.admin,
                      position: 100,
                      permissions: DEFAULT_ROLE_PERMISSIONS.admin,
                      is_system: true,
                      is_custom: false,
                    },
                    {
                      id: `${s.id}-moderator`,
                      server_id: s.id,
                      name: 'Moderator',
                      color: DEFAULT_ROLE_COLORS.moderator,
                      position: 50,
                      permissions: DEFAULT_ROLE_PERMISSIONS.moderator,
                      is_system: true,
                      is_custom: false,
                    },
                    {
                      id: `${s.id}-member`,
                      server_id: s.id,
                      name: 'Member',
                      color: DEFAULT_ROLE_COLORS.member,
                      position: 10,
                      permissions: DEFAULT_ROLE_PERMISSIONS.member,
                      is_system: true,
                      is_custom: false,
                    },
                  ];

            return {
              id: s.id,
              name: s.name,
              description: s.description,
              icon_url: s.icon_url,
              owner_id: s.owner_id,
              created_at: s.created_at,
              channels,
              roles: effectiveRoles,
              members: (s.server_members || []).map((m: any) => ({
                id: m.id,
                server_id: m.server_id,
                user_id: m.user_id,
                role: m.role,
                role_id: m.role_id || null,
                joined_at: m.joined_at,
                timeout_until: m.timeout_until || null,
                nickname: m.nickname || null,
                avatar_path: m.avatar_path || null,
                banner_path: m.banner_path || null,
                bio: m.bio || null,
                pronouns: m.pronouns || null,
                profile: (m.profile as unknown as UserProfile) || undefined,
              })),
            };
          });

        setServers(parsed);
        try {
          const userStorageKey = `${STORAGE_KEY}_${user.id}`;
          localStorage.setItem(userStorageKey, JSON.stringify(parsed));
          localStorage.removeItem(STORAGE_KEY);
        } catch {}
      }
    } catch (e) {
      console.warn('Failed to fetch servers from Supabase:', e);
    }
  }, [user]);

  // Initialize and load persisted servers + Realtime subscription
  React.useEffect(() => {
    try {
      const userStorageKey = user ? `${STORAGE_KEY}_${user.id}` : STORAGE_KEY;
      const stored = localStorage.getItem(userStorageKey);
      if (stored) {
        const parsed: Server[] = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const cleanServers = parsed.filter(
            (s) =>
              !DUMMY_SERVER_IDS.has(s.id) &&
              (s.owner_id === user?.id || (s.members || []).some((m) => m.user_id === user?.id))
          );
          setServers(cleanServers);
        }
      } else {
        setServers([]);
      }
    } catch (e) {
      console.warn('Failed to parse cached servers:', e);
    }

    fetchServers();

    if (!user || !supabase) return;

    const channel = realtimeHub
      .acquire('servers-realtime', undefined, supabase)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servers' }, () => {
        fetchServers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, () => {
        fetchServers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_members' }, () => {
        fetchServers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_roles' }, () => {
        fetchServers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_permission_overrides' }, () => {
        fetchServers();
      })
      .on('broadcast', { event: 'servers_update' }, () => {
        fetchServers();
      })
      .on('broadcast', { event: 'presence_status_change' }, ({ payload }: any) => {
        if (payload?.userId && payload?.status) {
          globalPresenceStore.setStatus(payload.userId, payload.status);
          setServers((prev) =>
            prev.map((s) => ({
              ...s,
              members: (s.members || []).map((m) =>
                m.user_id === payload.userId
                  ? {
                      ...m,
                      profile: m.profile
                        ? { ...m.profile, status: payload.status }
                        : ({ id: m.user_id, status: payload.status } as any),
                    }
                  : m
              ),
            }))
          );
        }
      });
    channel.subscribe();

    serversChannelRef.current = channel;

    const autoSyncTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchServers();
    }, 30000);

    const handleLocalServersUpdate = (e: any) => {
      if (Array.isArray(e.detail)) {
        setServers(e.detail);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('nexus_servers_updated', handleLocalServersUpdate);
    }

    return () => {
      clearInterval(autoSyncTimer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('nexus_servers_updated', handleLocalServersUpdate);
      }
      serversChannelRef.current = null;
      realtimeHub.release('servers-realtime', 1000);
    };
  }, [fetchServers, user]);

  const saveServers = React.useCallback(
    (updated: Server[]) => {
      const userServers = updated.filter(
        (s) =>
          !DUMMY_SERVER_IDS.has(s.id) &&
          (s.owner_id === user?.id || (s.members || []).some((m) => m.user_id === user?.id))
      );
      setServers(userServers);
      try {
        const userStorageKey = user ? `${STORAGE_KEY}_${user.id}` : STORAGE_KEY;
        localStorage.setItem(userStorageKey, JSON.stringify(userServers));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('nexus_servers_updated', { detail: userServers }));
        }
      } catch (e) {
        console.warn('Failed to cache servers:', e);
      }
    },
    [user]
  );

  const saveServersRef = React.useRef(saveServers);
  React.useEffect(() => {
    saveServersRef.current = saveServers;
  }, [saveServers]);

  const notifyServersUpdate = React.useCallback(() => {
    if (serversChannelRef.current) {
      if (serversChannelRef.current.state === 'joined') {
        serversChannelRef.current
          .send({ type: 'broadcast', event: 'servers_update', payload: {} })
          .catch(() => {});
      } else if (typeof (serversChannelRef.current as any).httpSend === 'function') {
        (serversChannelRef.current as any)
          .httpSend({ type: 'broadcast', event: 'servers_update', payload: {} })
          .catch(() => {});
      }
    }
  }, []);

  const createServer = React.useCallback(
    async (
      name: string,
      description?: string,
      iconUrl?: string,
      template: 'competitive' | 'hangout' | 'custom' = 'competitive'
    ) => {
      const serverId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
      const memberId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `00000000-0000-4000-8003-${Date.now().toString(16).padStart(12, '0')}`;

      const now = new Date().toISOString();
      const uuid = (idx: number) =>
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `00000000-0000-4000-80${idx}-${Date.now().toString(16).padStart(12, '0')}`;

      let initialChannels: Channel[] = [];
      if (template === 'competitive') {
        initialChannels = [
          { id: uuid(11), server_id: serverId, name: 'general', type: 'text', topic: 'General team discussion', position: 0, created_at: now },
          { id: uuid(12), server_id: serverId, name: 'tactics-and-lineups', type: 'text', topic: 'Executes, setups, and callouts', position: 1, created_at: now },
          { id: uuid(13), server_id: serverId, name: 'scrim-clips', type: 'text', topic: 'Clips, highlights, and VODs', position: 2, created_at: now },
          { id: uuid(14), server_id: serverId, name: 'Scrim Comms Alpha', type: 'voice', topic: 'Primary competitive voice lounge', position: 3, created_at: now },
          { id: uuid(15), server_id: serverId, name: 'Warmup Comms', type: 'voice', topic: 'Aim training & casual warmup', position: 4, created_at: now },
        ];
      } else if (template === 'hangout') {
        initialChannels = [
          { id: uuid(21), server_id: serverId, name: 'lounge-chat', type: 'text', topic: 'Casual banter and squad talk', position: 0, created_at: now },
          { id: uuid(22), server_id: serverId, name: 'memes-and-clips', type: 'text', topic: 'Funny gaming moments and setups', position: 1, created_at: now },
          { id: uuid(23), server_id: serverId, name: 'bot-commands', type: 'text', topic: 'Soundboard and bot commands', position: 2, created_at: now },
          { id: uuid(24), server_id: serverId, name: 'Squad Lounge Voice', type: 'voice', topic: 'Chill voice hangout', position: 3, created_at: now },
          { id: uuid(25), server_id: serverId, name: 'Watch Party', type: 'voice', topic: 'Screen share & streams', position: 4, created_at: now },
        ];
      } else {
        initialChannels = [
          { id: uuid(31), server_id: serverId, name: 'general', type: 'text', topic: 'General squad discussion', position: 0, created_at: now },
          { id: uuid(32), server_id: serverId, name: 'Voice Lounge', type: 'voice', topic: 'Voice channel', position: 1, created_at: now },
        ];
      }

      const newServer: Server = {
        id: serverId,
        name: name.trim(),
        description: description?.trim() || null,
        icon_url: iconUrl || null,
        owner_id: user?.id || 'current-user',
        created_at: now,
        channels: initialChannels,
        members: [
          {
            id: memberId,
            server_id: serverId,
            user_id: user?.id || 'current-user',
            role: 'owner',
            joined_at: now,
            profile: profile || undefined,
          },
        ],
      };

      const updated = [...servers, newServer];
      saveServersRef.current(updated);

      // Attempt Supabase insert if logged in
      if (user && supabase) {
        try {
          const { error: srvErr } = await supabase.from('servers').insert({
            id: newServer.id,
            name: newServer.name,
            description: newServer.description,
            icon_url: newServer.icon_url,
            owner_id: user.id,
          });
          if (srvErr) throw srvErr;

          const { error: memErr } = await supabase.from('server_members').insert({
            id: memberId,
            server_id: newServer.id,
            user_id: user.id,
            role: 'owner',
          });
          if (memErr) throw memErr;

          const { error: chanErr } = await supabase.from('channels').insert(
            newServer.channels.map((c) => ({
              id: c.id,
              server_id: newServer.id,
              name: c.name,
              type: c.type,
              topic: c.topic,
              position: c.position,
            }))
          );
          if (chanErr) throw chanErr;

          notifyServersUpdate();
        } catch (e) {
          console.error('Supabase server insert failed:', e);
        }
      }

      return newServer;
    },
    [servers, user, profile, notifyServersUpdate]
  );

  const updateServer = React.useCallback(
    async (
      serverId: string,
      updates: { name?: string; description?: string | null; icon_url?: string | null }
    ): Promise<MutationResult<Server>> => {
      const rollbackServers = servers;
      let updatedServer: Server | null = null;
      const updated = servers.map((srv) => {
        if (srv.id === serverId) {
          updatedServer = {
            ...srv,
            name: updates.name !== undefined ? updates.name.trim() : srv.name,
            description:
              updates.description !== undefined
                ? updates.description
                  ? updates.description.trim()
                  : null
                : srv.description,
            icon_url: updates.icon_url !== undefined ? updates.icon_url : srv.icon_url,
          };
          return updatedServer;
        }
        return srv;
      });

      setServers(updated);
      saveServersRef.current(updated);

      if (user && supabase && updatedServer) {
        try {
          const { error } = await supabase
            .from('servers')
            .update({
              name: (updatedServer as Server).name,
              description: (updatedServer as Server).description,
              icon_url: (updatedServer as Server).icon_url,
            })
            .eq('id', serverId);

          if (error) {
            setServers(rollbackServers);
            saveServersRef.current(rollbackServers);
            return { ok: false, error: error.message };
          }
          notifyServersUpdate();
          return { ok: true, data: updatedServer };
        } catch (e: any) {
          setServers(rollbackServers);
          saveServersRef.current(rollbackServers);
          return { ok: false, error: e?.message || 'Failed to update server' };
        }
      }

      return { ok: true, data: updatedServer || undefined };
    },
    [servers, user, notifyServersUpdate]
  );

  const createChannel = React.useCallback(
    async (
      serverId: string,
      name: string,
      type: ChannelType = 'text',
      topic?: string
    ): Promise<MutationResult<Channel>> => {
      const trimmedName = name.trim();
      if (!trimmedName || trimmedName.length > 50) {
        return { ok: false, error: 'Channel name must be between 1 and 50 characters' };
      }

      const channelId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `00000000-0000-4000-8004-${Date.now().toString(16).padStart(12, '0')}`;
      const cleanName =
        type === 'text'
          ? trimmedName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '')
          : trimmedName;

      const newChannel: Channel = {
        id: channelId,
        server_id: serverId,
        name: cleanName || (type === 'text' ? 'new-channel' : 'Voice Lounge'),
        type,
        topic: topic?.trim() || null,
        position: 99,
        created_at: new Date().toISOString(),
      };

      const rollbackServers = servers;
      const updated = servers.map((srv) => {
        if (srv.id === serverId) {
          return {
            ...srv,
            channels: [...srv.channels, newChannel],
          };
        }
        return srv;
      });

      setServers(updated);
      saveServersRef.current(updated);

      if (user && supabase) {
        try {
          const { error: chanErr } = await supabase.from('channels').insert({
            id: newChannel.id,
            server_id: serverId,
            name: newChannel.name,
            type: newChannel.type,
            topic: newChannel.topic,
            position: newChannel.position,
          });
          if (chanErr) {
            setServers(rollbackServers);
            saveServersRef.current(rollbackServers);
            return { ok: false, error: chanErr.message };
          }

          notifyServersUpdate();
          return { ok: true, data: newChannel };
        } catch (e: any) {
          setServers(rollbackServers);
          saveServersRef.current(rollbackServers);
          return { ok: false, error: e?.message || 'Supabase channel insert failed' };
        }
      }

      return { ok: true, data: newChannel };
    },
    [servers, user, notifyServersUpdate]
  );

  const updateChannel = React.useCallback(
    async (
      serverId: string,
      channelId: string,
      updates: { name?: string; topic?: string | null }
    ): Promise<MutationResult<Channel>> => {
      const rollbackServers = servers;
      let updatedChan: Channel | null = null;

      const updated = servers.map((srv) => {
        if (srv.id === serverId) {
          return {
            ...srv,
            channels: srv.channels.map((c) => {
              if (c.id === channelId) {
                const cleanName =
                  updates.name !== undefined
                    ? c.type === 'text'
                      ? updates.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '')
                      : updates.name.trim()
                    : c.name;

                updatedChan = {
                  ...c,
                  name: cleanName || c.name,
                  topic: updates.topic !== undefined ? (updates.topic ? updates.topic.trim() : null) : c.topic,
                };
                return updatedChan;
              }
              return c;
            }),
          };
        }
        return srv;
      });

      setServers(updated);
      saveServersRef.current(updated);

      if (user && supabase && updatedChan) {
        try {
          const { error } = await supabase
            .from('channels')
            .update({
              name: (updatedChan as Channel).name,
              topic: (updatedChan as Channel).topic,
            })
            .eq('id', channelId);

          if (error) {
            setServers(rollbackServers);
            saveServersRef.current(rollbackServers);
            return { ok: false, error: error.message };
          }
          notifyServersUpdate();
          return { ok: true, data: updatedChan };
        } catch (e: any) {
          setServers(rollbackServers);
          saveServersRef.current(rollbackServers);
          return { ok: false, error: e?.message || 'Supabase channel update failed' };
        }
      }

      return { ok: true, data: updatedChan || undefined };
    },
    [servers, user, notifyServersUpdate]
  );

  const deleteChannel = React.useCallback(
    async (serverId: string, channelId: string): Promise<MutationResult> => {
      const rollbackServers = servers;
      const updated = servers.map((srv) => {
        if (srv.id === serverId) {
          return {
            ...srv,
            channels: srv.channels.filter((c) => c.id !== channelId),
          };
        }
        return srv;
      });

      setServers(updated);
      saveServersRef.current(updated);

      if (user && supabase) {
        try {
          const { error } = await supabase.rpc('delete_channel', {
            p_channel_id: channelId,
          });

          if (error) {
            setServers(rollbackServers);
            saveServersRef.current(rollbackServers);
            return { ok: false, error: error.message };
          }
          notifyServersUpdate();
          return { ok: true };
        } catch (e: any) {
          setServers(rollbackServers);
          saveServersRef.current(rollbackServers);
          return { ok: false, error: e?.message || 'Supabase channel delete failed' };
        }
      }

      return { ok: true };
    },
    [servers, user, notifyServersUpdate]
  );

  const reorderChannels = React.useCallback(
    async (serverId: string, orderedChannelIds: string[]): Promise<MutationResult> => {
      const rollbackServers = servers;
      const updated = servers.map((srv) => {
        if (srv.id === serverId) {
          const map = new Map(srv.channels.map((c) => [c.id, c]));
          const reordered: Channel[] = [];
          orderedChannelIds.forEach((id, index) => {
            const ch = map.get(id);
            if (ch) {
              reordered.push({ ...ch, position: index });
              map.delete(id);
            }
          });
          map.forEach((ch) => reordered.push(ch));
          return {
            ...srv,
            channels: reordered,
          };
        }
        return srv;
      });

      setServers(updated);
      saveServersRef.current(updated);

      if (user && supabase) {
        try {
          const { error } = await supabase.rpc('reorder_channels', {
            p_server_id: serverId,
            p_ordered_ids: orderedChannelIds,
          });

          if (error) {
            setServers(rollbackServers);
            saveServersRef.current(rollbackServers);
            return { ok: false, error: error.message };
          }
          notifyServersUpdate();
          return { ok: true };
        } catch (e: any) {
          setServers(rollbackServers);
          saveServersRef.current(rollbackServers);
          return { ok: false, error: e?.message || 'Supabase channel reorder failed' };
        }
      }

      return { ok: true };
    },
    [servers, user, notifyServersUpdate]
  );

  const deleteServer = React.useCallback(
    async (serverId: string): Promise<MutationResult> => {
      const rollbackServers = servers;
      const updated = servers.filter((s) => s.id !== serverId);
      setServers(updated);
      saveServersRef.current(updated);

      if (user && supabase) {
        try {
          const { error: rpcError } = await supabase.rpc('delete_server', {
            p_server_id: serverId,
          });

          if (rpcError) {
            const { error: directError } = await supabase.from('servers').delete().eq('id', serverId);
            if (directError) {
              setServers(rollbackServers);
              saveServersRef.current(rollbackServers);
              return { ok: false, error: rpcError.message || directError.message };
            }
          }
          notifyServersUpdate();
          return { ok: true };
        } catch (e: any) {
          setServers(rollbackServers);
          saveServersRef.current(rollbackServers);
          return { ok: false, error: e?.message || 'Supabase server delete failed' };
        }
      }

      return { ok: true };
    },
    [servers, user, notifyServersUpdate]
  );

  const joinServer = React.useCallback(
    async (serverIdOrInvite: string): Promise<{ success: boolean; server?: Server; error?: string }> => {
      const rawInput = serverIdOrInvite?.trim();
      if (!rawInput) {
        return { success: false, error: 'Please enter a valid Server Invite Code or Link.' };
      }

      // Extract code from link formats (e.g., https://.../invite/CODE, ?invite=CODE, ?join=CODE, or raw CODE)
      let inviteCode = rawInput;
      if (rawInput.includes('/invite/')) {
        inviteCode = rawInput.split('/invite/').pop()?.split(/[?#]/)[0] || rawInput;
      } else if (rawInput.includes('invite=')) {
        inviteCode = new URL(rawInput, 'http://localhost').searchParams.get('invite') || rawInput;
      } else if (rawInput.includes('join=')) {
        inviteCode = new URL(rawInput, 'http://localhost').searchParams.get('join') || rawInput;
      }

      inviteCode = inviteCode.trim();

      if (!user || !supabase) {
        return { success: false, error: 'Please sign in to join squad servers.' };
      }

      try {
        const { data: joinRes, error: joinErr } = await supabase.rpc('join_server_with_invite', {
          p_code: inviteCode,
        });

        if (joinErr) {
          const errMsg = joinErr.message || '';
          if (errMsg.includes('banned')) {
            return { success: false, error: 'You are banned from this server.' };
          }
          if (errMsg.includes('expired')) {
            return { success: false, error: 'This invite link has expired.' };
          }
          if (errMsg.includes('maximum uses')) {
            return { success: false, error: 'This invite link has reached its maximum uses.' };
          }
          if (errMsg.includes('revoked')) {
            return { success: false, error: 'This invite link has been revoked.' };
          }
          if (errMsg.includes('Invalid')) {
            return { success: false, error: 'Invalid server invite code or link.' };
          }
          return { success: false, error: errMsg || 'Failed to join server.' };
        }

        const targetServerId = joinRes?.server_id;
        if (!targetServerId) {
          return { success: false, error: 'Failed to resolve server details from invite.' };
        }

        const { data: srvData, error: srvErr } = await supabase
          .from('servers')
          .select(`
            id, name, description, icon_url, owner_id, created_at,
            channels ( id, server_id, name, type, topic, position, created_at ),
            server_members (
              id, server_id, user_id, role, joined_at,
              nickname, avatar_path, banner_path, bio, pronouns,
              profile:user_id (
                id, username, display_name, avatar_url, avatar_path, avatar_color, status
              )
            )
          `)
          .eq('id', targetServerId)
          .single();

        if (srvErr || !srvData) {
          return { success: false, error: 'Unable to load server after joining.' };
        }

        const parsedServer: Server = {
          id: srvData.id,
          name: srvData.name,
          description: srvData.description,
          icon_url: srvData.icon_url,
          owner_id: srvData.owner_id,
          created_at: srvData.created_at,
          channels: (srvData.channels || [])
            .sort((a: Channel, b: Channel) => (a.position || 0) - (b.position || 0)),
          members: [
            ...(srvData.server_members || []).map((m: any) => ({
              id: m.id,
              server_id: m.server_id,
              user_id: m.user_id,
              role: m.role,
              joined_at: m.joined_at,
              nickname: m.nickname || null,
              avatar_path: m.avatar_path || null,
              banner_path: m.banner_path || null,
              bio: m.bio || null,
              pronouns: m.pronouns || null,
              profile: m.profile || undefined,
            })),
          ],
        };

        const updated = [...servers.filter((s) => s.id !== parsedServer.id), parsedServer];
        saveServersRef.current(updated);
        notifyServersUpdate();
        return { success: true, server: parsedServer };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to join server.' };
      }
    },
    [servers, user, notifyServersUpdate]
  );

  const leaveServer = React.useCallback(
    async (serverId: string): Promise<boolean> => {
      if (!user) return false;
      const srv = servers.find((s) => s.id === serverId);
      if (!srv) return false;
      if (srv.owner_id === user.id) {
        return false;
      }

      const updated = servers.filter((s) => s.id !== serverId);
      saveServersRef.current(updated);

      if (supabase) {
        try {
          const { error: leaveErr } = await supabase
            .from('server_members')
            .delete()
            .eq('server_id', serverId)
            .eq('user_id', user.id);
          if (leaveErr) {
            console.error('Failed to leave server:', leaveErr);
            saveServersRef.current(servers);
            return false;
          }
          notifyServersUpdate();
        } catch (err) {
          console.error('Error leaving server:', err);
          saveServersRef.current(servers);
          return false;
        }
      }
      return true;
    },
    [servers, user, notifyServersUpdate]
  );

  const transferOwnership = React.useCallback(
    async (serverId: string, newOwnerId: string): Promise<boolean> => {
      if (!user || !supabase) return false;
      try {
        const { error } = await supabase.rpc('transfer_server_ownership', {
          p_server_id: serverId,
          p_new_owner_id: newOwnerId,
        });
        if (error) {
          console.error('[useServers] Error transferring server ownership:', error);
          return false;
        }
        await fetchServers();
        notifyServersUpdate();
        return true;
      } catch (err) {
        console.error('[useServers] Exception transferring server ownership:', err);
        return false;
      }
    },
    [user, fetchServers, notifyServersUpdate]
  );

  const updateMemberRole = React.useCallback(
    async (
      serverId: string,
      userId: string,
      newRole: Server['members'][0]['role'],
      roleId?: string
    ): Promise<MutationResult> => {
      if (!user || !supabase) {
        return { ok: false, error: 'Authentication required' };
      }
      const rollbackServers = servers;
      const server = servers.find((s) => s.id === serverId);
      const targetRoleId = roleId || server?.roles?.find((r) => r.id === newRole || r.name.toLowerCase() === newRole.toLowerCase())?.id;

      if (targetRoleId) {
        try {
          const matchedRoleDef = server?.roles?.find((r) => r.id === targetRoleId);
          const effectiveRole = (matchedRoleDef?.is_system ? matchedRoleDef.name.toLowerCase() : 'member') as Server['members'][0]['role'];

          const { error } = await supabase.rpc('set_member_role', {
            p_server_id: serverId,
            p_user_id: userId,
            p_role_id: targetRoleId,
          });

          if (error) {
            const { error: directErr } = await supabase
              .from('server_members')
              .update({ role_id: targetRoleId, role: effectiveRole })
              .eq('server_id', serverId)
              .eq('user_id', userId);

            if (directErr) {
              return { ok: false, error: error.message };
            }
          }

          const updated = servers.map((srv) => {
            if (srv.id === serverId) {
              return {
                ...srv,
                members: srv.members.map((m) =>
                  m.user_id === userId ? { ...m, role: effectiveRole, role_id: targetRoleId } : m
                ),
              };
            }
            return srv;
          });

          setServers(updated);
          saveServersRef.current(updated);
          notifyServersUpdate();
          return { ok: true };
        } catch (err: any) {
          setServers(rollbackServers);
          saveServersRef.current(rollbackServers);
          return { ok: false, error: err?.message || 'Failed to update member role' };
        }
      }

      // Legacy fallback
      try {
        const { error: updateErr } = await supabase
          .from('server_members')
          .update({ role: newRole })
          .eq('server_id', serverId)
          .eq('user_id', userId);
        if (updateErr) {
          console.error('Failed to update member role:', updateErr);
          setServers(rollbackServers);
          saveServersRef.current(rollbackServers);
          return { ok: false, error: updateErr.message };
        }

        const updated = servers.map((srv) => {
          if (srv.id === serverId) {
            return {
              ...srv,
              members: srv.members.map((m) => (m.user_id === userId ? { ...m, role: newRole } : m)),
            };
          }
          return srv;
        });

        setServers(updated);
        saveServersRef.current(updated);
        notifyServersUpdate();
        return { ok: true };
      } catch (err: any) {
        console.error('Error updating member role:', err);
        setServers(rollbackServers);
        saveServersRef.current(rollbackServers);
        return { ok: false, error: err?.message || 'Failed to update member role' };
      }
    },
    [servers, user, notifyServersUpdate]
  );

  const kickMember = React.useCallback(
    async (serverId: string, userId: string, reason?: string): Promise<boolean> => {
      const updated = servers.map((srv) => {
        if (srv.id === serverId) {
          return {
            ...srv,
            members: srv.members.filter((m) => m.user_id !== userId),
          };
        }
        return srv;
      });

      saveServersRef.current(updated);

      if (user && supabase) {
        try {
          const { error } = await supabase.rpc('kick_server_member', {
            p_server_id: serverId,
            p_user_id: userId,
            p_reason: reason || null,
          });
          if (error) {
            const { error: delErr } = await supabase
              .from('server_members')
              .delete()
              .eq('server_id', serverId)
              .eq('user_id', userId);
            if (delErr) {
              console.error('Failed to delete member during kick fallback:', delErr);
              saveServersRef.current(servers);
              return false;
            }
          }
          notifyServersUpdate();
          return true;
        } catch (err) {
          console.error('Error kicking member:', err);
          saveServersRef.current(servers);
          return false;
        }
      }
      return true;
    },
    [servers, user, notifyServersUpdate]
  );

  const banMember = React.useCallback(
    async (serverId: string, userId: string, reason?: string): Promise<{ success: boolean; error: string | null }> => {
      if (!user || !supabase) return { success: false, error: 'Not authenticated' };
      try {
        const { error } = await supabase.rpc('ban_server_member', {
          p_server_id: serverId,
          p_user_id: userId,
          p_reason: reason || null,
        });
        if (error) throw error;

        // Automatically dispatch a direct message notification to the banned user
        try {
          const srv = servers.find((s) => s.id === serverId);
          const serverName = srv?.name || 'the server';
          const banReason = reason?.trim() || 'No reason specified.';

          let convId: string | null = null;
          const { data: convData, error: convErr } = await supabase.rpc('create_or_get_direct_conversation', {
            target_user_id: userId,
          });
          if (!convErr && convData) {
            convId = convData as string;
          } else {
            // Direct query fallback
            const { data: myMemberRows } = await supabase
              .from('conversation_members')
              .select('conversation_id')
              .eq('user_id', user.id);
            if (myMemberRows && myMemberRows.length > 0) {
              const myConvIds = myMemberRows.map((r: { conversation_id: string }) => r.conversation_id);
              const { data: targetRows } = await supabase
                .from('conversation_members')
                .select('conversation_id')
                .in('conversation_id', myConvIds)
                .eq('user_id', userId);
              if (targetRows && targetRows.length > 0) {
                convId = targetRows[0].conversation_id;
              }
            }
          }

          if (convId) {
            await supabase.from('messages').insert({
              conversation_id: convId,
              sender_id: user.id,
              content: `⚠️ You have been banned from **${serverName}**.\n**Reason:** ${banReason}`,
            });
          }
        } catch (dmErr) {
          console.warn('Could not send ban notification DM:', dmErr);
        }

        await fetchServers();
        return { success: true, error: null };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to ban member' };
      }
    },
    [user, fetchServers, servers]
  );

  const unbanMember = React.useCallback(
    async (
      serverId: string,
      userId: string,
      restoreMember = false
    ): Promise<{ success: boolean; error: string | null }> => {
      if (!user || !supabase) return { success: false, error: 'Not authenticated' };
      try {
        const { error } = await supabase.rpc('unban_server_member', {
          p_server_id: serverId,
          p_user_id: userId,
          p_restore_member: restoreMember,
        });

        // Ensure direct deletion from server_bans table
        await supabase
          .from('server_bans')
          .delete()
          .eq('server_id', serverId)
          .eq('user_id', userId);

        // When restoreMember is false, ensure the user is removed from server_members table
        if (!restoreMember) {
          await supabase
            .from('server_members')
            .delete()
            .eq('server_id', serverId)
            .eq('user_id', userId);
        }

        if (error) {
          console.warn('unban_server_member RPC error, ensured direct delete:', error.message);
        }

        // Send a private chat message to the unbanned user notifying them
        try {
          const srv = servers.find((s) => s.id === serverId);
          const serverName = srv?.name || 'the server';

          let convId: string | null = null;
          const { data: convData, error: convErr } = await supabase.rpc('create_or_get_direct_conversation', {
            target_user_id: userId,
          });
          if (!convErr && convData) {
            convId = convData as string;
          } else {
            // Direct query fallback for existing DM
            const { data: myMemberRows } = await supabase
              .from('conversation_members')
              .select('conversation_id')
              .eq('user_id', user.id);
            if (myMemberRows && myMemberRows.length > 0) {
              const myConvIds = myMemberRows.map((r: { conversation_id: string }) => r.conversation_id);
              const { data: targetRows } = await supabase
                .from('conversation_members')
                .select('conversation_id')
                .in('conversation_id', myConvIds)
                .eq('user_id', userId);
              if (targetRows && targetRows.length > 0) {
                convId = targetRows[0].conversation_id;
              }
            }
          }

          if (convId) {
            await supabase.from('messages').insert({
              conversation_id: convId,
              sender_id: user.id,
              content: `ℹ️ You have been unbanned from **${serverName}**.`,
            });
          }
        } catch (dmErr) {
          console.warn('Could not send unban notification DM:', dmErr);
        }

        await fetchServers();
        notifyServersUpdate();
        return { success: true, error: null };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to unban member' };
      }
    },
    [user, fetchServers, notifyServersUpdate, servers]
  );

  const timeoutMember = React.useCallback(
    async (
      serverId: string,
      userId: string,
      durationSeconds: number,
      reason?: string
    ): Promise<{ success: boolean; error: string | null }> => {
      if (!user || !supabase) return { success: false, error: 'Not authenticated' };
      try {
        const { error } = await supabase.rpc('timeout_server_member', {
          p_server_id: serverId,
          p_user_id: userId,
          p_duration_seconds: durationSeconds,
          p_reason: reason || null,
        });

        if (error) {
          const timeoutUntil =
            durationSeconds > 0
              ? new Date(Date.now() + durationSeconds * 1000).toISOString()
              : null;
          const { error: directErr } = await supabase
            .from('server_members')
            .update({ timeout_until: timeoutUntil })
            .eq('server_id', serverId)
            .eq('user_id', userId);

          if (directErr) {
            throw error;
          }
        }

        await fetchServers();
        notifyServersUpdate();
        return { success: true, error: null };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to timeout member' };
      }
    },
    [user, fetchServers, supabase, notifyServersUpdate]
  );

  const createInvite = React.useCallback(
    async (
      serverId: string,
      maxUses = 0,
      expiresInHours = 0
    ): Promise<{ invite: ServerInvite | null; error: string | null }> => {
      if (!user || !supabase) return { invite: null, error: 'Not authenticated' };
      try {
        const { data, error } = await supabase.rpc('create_server_invite', {
          p_server_id: serverId,
          p_max_uses: maxUses,
          p_expires_in_hours: expiresInHours,
        });

        if (!error && data) {
          return { invite: data as ServerInvite, error: null };
        }

        // Direct table insert fallback if RPC is not cached
        const code = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        const expiresAt =
          expiresInHours > 0
            ? new Date(Date.now() + expiresInHours * 3600000).toISOString()
            : null;

        const { data: directData, error: directErr } = await supabase
          .from('server_invites')
          .insert({
            server_id: serverId,
            code,
            created_by: user.id,
            max_uses: maxUses,
            expires_at: expiresAt,
          })
          .select()
          .single();

        if (directErr) {
          throw error || directErr;
        }

        return { invite: directData as ServerInvite, error: null };
      } catch (err: any) {
        return { invite: null, error: err?.message || 'Failed to generate invite' };
      }
    },
    [user, supabase]
  );

  const revokeInvite = React.useCallback(
    async (inviteId: string): Promise<{ success: boolean; error: string | null }> => {
      if (!user || !supabase) return { success: false, error: 'Not authenticated' };
      try {
        const { error } = await supabase.rpc('revoke_server_invite', {
          p_invite_id: inviteId,
        });
        if (error) throw error;
        return { success: true, error: null };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to revoke invite' };
      }
    },
    [user, supabase]
  );

  const fetchAuditLogs = React.useCallback(
    async (serverId: string): Promise<ModerationAuditLog[]> => {
      if (!user || !supabase) return [];
      try {
        const { data, error } = await supabase
          .from('moderation_audit_logs')
          .select(`
            id, server_id, actor_id, target_id, action, reason, details, created_at,
            actor:profiles!actor_id ( id, username, display_name, avatar_url ),
            target:profiles!target_id ( id, username, display_name, avatar_url )
          `)
          .eq('server_id', serverId)
          .order('created_at', { ascending: false })
          .limit(50);

        if (!error && data) {
          return data as unknown as ModerationAuditLog[];
        }

        // Resilient fallback query if FK join alias resolution encounters PostgREST issues
        const { data: rawLogs } = await supabase
          .from('moderation_audit_logs')
          .select('*')
          .eq('server_id', serverId)
          .order('created_at', { ascending: false })
          .limit(50);

        if (!rawLogs || rawLogs.length === 0) return [];

        const userIds = Array.from(
          new Set(rawLogs.flatMap((l) => [l.actor_id, l.target_id]).filter(Boolean) as string[])
        );

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', userIds);

        const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

        return rawLogs.map((log) => ({
          ...log,
          actor: log.actor_id ? profileMap.get(log.actor_id) : undefined,
          target: log.target_id ? profileMap.get(log.target_id) : undefined,
        })) as ModerationAuditLog[];
      } catch {
        return [];
      }
    },
    [user, supabase]
  );

  const fetchBans = React.useCallback(
    async (serverId: string): Promise<ServerBan[]> => {
      if (!user || !supabase) return [];
      try {
        const { data, error } = await supabase
          .from('server_bans')
          .select(`
            id, server_id, user_id, banned_by, reason, created_at,
            profile:profiles!user_id ( id, username, display_name, avatar_url ),
            banner_profile:profiles!banned_by ( id, username, display_name, avatar_url )
          `)
          .eq('server_id', serverId)
          .order('created_at', { ascending: false });

        if (!error && data) {
          return data as unknown as ServerBan[];
        }

        // Resilient fallback query
        const { data: rawBans } = await supabase
          .from('server_bans')
          .select('*')
          .eq('server_id', serverId)
          .order('created_at', { ascending: false });

        if (!rawBans || rawBans.length === 0) return [];

        const userIds = Array.from(
          new Set(rawBans.flatMap((b) => [b.user_id, b.banned_by]).filter(Boolean) as string[])
        );

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', userIds);

        const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

        return rawBans.map((ban) => ({
          ...ban,
          profile: ban.user_id ? profileMap.get(ban.user_id) : undefined,
          banner_profile: ban.banned_by ? profileMap.get(ban.banned_by) : undefined,
        })) as ServerBan[];
      } catch {
        return [];
      }
    },
    [user, supabase]
  );

  const fetchInvites = React.useCallback(
    async (serverId: string): Promise<ServerInvite[]> => {
      if (!user || !supabase) return [];
      try {
        const { data } = await supabase
          .from('server_invites')
          .select('*')
          .eq('server_id', serverId)
          .order('created_at', { ascending: false });
        return (data as unknown as ServerInvite[]) || [];
      } catch {
        return [];
      }
    },
    [user, supabase]
  );

  const fetchServerReports = React.useCallback(
    async (serverId: string) => {
      if (!user || !supabase) return [];
      try {
        const { data, error } = await supabase
          .from('reports')
          .select(`
            id, reporter_id, reported_user_id, server_id, message_id, reason, description, status, action_taken, created_at,
            reporter:profiles!reporter_id ( id, username, display_name, avatar_url ),
            reported:profiles!reported_user_id ( id, username, display_name, avatar_url )
          `)
          .eq('server_id', serverId)
          .order('created_at', { ascending: false });

        if (!error && data) return data;

        // Fallback
        const { data: rawReports } = await supabase
          .from('reports')
          .select('*')
          .eq('server_id', serverId)
          .order('created_at', { ascending: false });

        if (!rawReports || rawReports.length === 0) return [];

        const userIds = Array.from(
          new Set(rawReports.flatMap((r) => [r.reporter_id, r.reported_user_id]).filter(Boolean) as string[])
        );

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', userIds);

        const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

        return rawReports.map((r) => ({
          ...r,
          reporter: r.reporter_id ? profileMap.get(r.reporter_id) : undefined,
          reported: r.reported_user_id ? profileMap.get(r.reported_user_id) : undefined,
        }));
      } catch {
        return [];
      }
    },
    [user, supabase]
  );

  const resolveReport = React.useCallback(
    async (reportId: string, actionTaken = 'Action taken') => {
      if (!user || !supabase) return false;
      try {
        const { error: rpcErr } = await supabase.rpc('resolve_report', {
          p_report_id: reportId,
          p_status: 'resolved',
          p_action_taken: actionTaken,
        });
        if (!rpcErr) return true;

        const { error } = await supabase
          .from('reports')
          .update({
            status: 'resolved',
          })
          .eq('id', reportId);
        return !error;
      } catch {
        return false;
      }
    },
    [user, supabase]
  );

  const dismissReport = React.useCallback(
    async (reportId: string) => {
      if (!user || !supabase) return false;
      try {
        const { error: rpcErr } = await supabase.rpc('resolve_report', {
          p_report_id: reportId,
          p_status: 'dismissed',
          p_action_taken: 'Dismissed by moderator',
        });
        if (!rpcErr) return true;

        const { error } = await supabase
          .from('reports')
          .update({
            status: 'dismissed',
          })
          .eq('id', reportId);
        return !error;
      } catch {
        return false;
      }
    },
    [user, supabase]
  );

  const createRole = React.useCallback(
    async (
      serverId: string,
      name: string,
      color: string,
      permissions: ServerPermission[]
    ): Promise<MutationResult<RoleDefinition>> => {
      if (!user || !supabase) {
        return { ok: false, error: 'Authentication required' };
      }
      try {
        let roleId: string | null = null;
        let roleRecord: any = null;

        const { data, error } = await supabase.rpc('create_server_role', {
          p_server_id: serverId,
          p_name: name,
          p_color: color,
          p_permissions: permissions,
        });

        if (!error && data) {
          let rawData: any = data;
          if (typeof data === 'string') {
            const trimmed = data.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              try {
                rawData = JSON.parse(trimmed);
              } catch {
                rawData = { id: trimmed };
              }
            } else {
              rawData = { id: trimmed };
            }
          }
          roleId = (rawData && typeof rawData === 'object' && rawData.id) || (typeof data === 'string' ? data : null);
          roleRecord = rawData;
        } else {
          // Direct table insert fallback if RPC failed (e.g. audit function issue or schema mismatch)
          const { data: directData, error: directErr } = await supabase
            .from('server_roles')
            .insert({
              server_id: serverId,
              name: name.trim(),
              color,
              permissions,
              is_system: false,
            })
            .select()
            .single();

          if (directErr) {
            return { ok: false, error: error?.message || directErr.message };
          }
          roleRecord = directData;
          roleId = directData.id;
        }

        const newRole: RoleDefinition = {
          id: roleId || crypto.randomUUID(),
          server_id: (roleRecord && roleRecord.server_id) || serverId,
          name: (roleRecord && roleRecord.name) || name,
          color: (roleRecord && roleRecord.color) || color,
          position: roleRecord && typeof roleRecord.position === 'number' ? roleRecord.position : 2,
          permissions: ((roleRecord && roleRecord.permissions) || permissions || []) as ServerPermission[],
          is_system: roleRecord && typeof roleRecord.is_system === 'boolean' ? roleRecord.is_system : false,
          is_custom: true,
        };

        const updated = servers.map((srv) => {
          if (srv.id === serverId) {
            const existingRoles = srv.roles || [];
            return {
              ...srv,
              roles: [...existingRoles, newRole],
            };
          }
          return srv;
        });

        setServers(updated);
        saveServersRef.current(updated);
        notifyServersUpdate();
        return { ok: true, data: newRole };
      } catch (e: unknown) {
        return { ok: false, error: e instanceof Error ? e.message : 'Failed to create role' };
      }
    },
    [servers, user, notifyServersUpdate]
  );

  const updateRole = React.useCallback(
    async (
      serverId: string,
      roleId: string,
      updates: Partial<RoleDefinition>
    ): Promise<MutationResult> => {
      if (!user || !supabase) {
        return { ok: false, error: 'Authentication required' };
      }
      const rollbackServers = servers;
      try {
        const { error: rpcError } = await supabase.rpc('update_server_role', {
          p_role_id: roleId,
          p_name: updates.name || null,
          p_color: updates.color || null,
          p_permissions: updates.permissions || null,
        });

        if (rpcError) {
          // Direct table update fallback if RPC is not present
          const patch: Record<string, unknown> = {};
          if (updates.name !== undefined) patch.name = updates.name;
          if (updates.color !== undefined) patch.color = updates.color;
          if (updates.permissions !== undefined) patch.permissions = updates.permissions;

          const { error: tableError } = await supabase
            .from('server_roles')
            .update(patch)
            .eq('id', roleId);

          if (tableError) {
            return { ok: false, error: rpcError.message || tableError.message };
          }
        }

        const updated = servers.map((srv) => {
          if (srv.id === serverId) {
            const roles = (srv.roles || []).map((r) =>
              r.id === roleId ? { ...r, ...updates } : r
            );
            return { ...srv, roles };
          }
          return srv;
        });

        setServers(updated);
        saveServersRef.current(updated);
        notifyServersUpdate();
        return { ok: true };
      } catch (e: unknown) {
        setServers(rollbackServers);
        saveServersRef.current(rollbackServers);
        return { ok: false, error: e instanceof Error ? e.message : 'Failed to update role' };
      }
    },
    [servers, user, notifyServersUpdate]
  );

  const deleteRole = React.useCallback(
    async (serverId: string, roleId: string): Promise<MutationResult> => {
      if (!user || !supabase) {
        return { ok: false, error: 'Authentication required' };
      }
      const rollbackServers = servers;
      try {
        const { error: rpcError } = await supabase.rpc('delete_server_role', {
          p_role_id: roleId,
        });

        if (rpcError) {
          // Direct table delete fallback if RPC is not present
          const { error: tableError } = await supabase
            .from('server_roles')
            .delete()
            .eq('id', roleId);

          if (tableError) {
            return { ok: false, error: rpcError.message || tableError.message };
          }
        }

        const updated = servers.map((srv) => {
          if (srv.id === serverId) {
            const roles = (srv.roles || []).filter((r) => r.id !== roleId);
            const members = srv.members.map((m) =>
              m.role_id === roleId || m.role === roleId ? { ...m, role: 'member', role_id: null } : m
            );
            return { ...srv, roles, members };
          }
          return srv;
        });

        setServers(updated);
        saveServersRef.current(updated);
        notifyServersUpdate();
        return { ok: true };
      } catch (e: unknown) {
        setServers(rollbackServers);
        saveServersRef.current(rollbackServers);
        return { ok: false, error: e instanceof Error ? e.message : 'Failed to delete role' };
      }
    },
    [servers, user, notifyServersUpdate]
  );

  const setChannelPermissionOverride = React.useCallback(
    async (
      serverId: string,
      channelId: string,
      roleId: string,
      allow: ServerPermission[],
      deny: ServerPermission[]
    ): Promise<MutationResult> => {
      if (!user || !supabase) {
        return { ok: false, error: 'Authentication required' };
      }
      const rollbackServers = servers;
      try {
        const { error: rpcErr } = await supabase.rpc('set_channel_permission_override', {
          p_channel_id: channelId,
          p_role_id: roleId,
          p_allow: allow,
          p_deny: deny,
        });

        if (rpcErr) {
          if (allow.length === 0 && deny.length === 0) {
            await supabase
              .from('channel_permission_overrides')
              .delete()
              .eq('channel_id', channelId)
              .eq('role_id', roleId);
          } else {
            const { error: tableErr } = await supabase
              .from('channel_permission_overrides')
              .upsert(
                {
                  channel_id: channelId,
                  role_id: roleId,
                  allow,
                  deny,
                },
                { onConflict: 'channel_id,role_id' }
              );
            if (tableErr) {
              return { ok: false, error: rpcErr.message || tableErr.message };
            }
          }
        }

        const updated = servers.map((srv) => {
          if (srv.id === serverId) {
            const channels = (srv.channels || []).map((ch) => {
              if (ch.id === channelId) {
                const existing = (ch.permission_overrides || []).filter((o) => o.role_id !== roleId);
                const nextOverrides =
                  allow.length > 0 || deny.length > 0
                    ? [...existing, { channel_id: channelId, role_id: roleId, allow, deny }]
                    : existing;
                return { ...ch, permission_overrides: nextOverrides };
              }
              return ch;
            });
            return { ...srv, channels };
          }
          return srv;
        });

        setServers(updated);
        saveServersRef.current(updated);
        notifyServersUpdate();
        return { ok: true };
      } catch (e: unknown) {
        setServers(rollbackServers);
        saveServersRef.current(rollbackServers);
        return { ok: false, error: e instanceof Error ? e.message : 'Failed to set channel permission' };
      }
    },
    [servers, user, notifyServersUpdate]
  );

  const updateRolePermissions = React.useCallback(
    async (
      serverId: string,
      roleIdOrName: string,
      permissions: ServerPermission[]
    ): Promise<MutationResult> => {
      const server = servers.find((s) => s.id === serverId);
      const role = server?.roles?.find((r) => r.id === roleIdOrName || r.name.toLowerCase() === roleIdOrName.toLowerCase());
      if (!role) {
        return { ok: false, error: 'Role not found' };
      }
      return updateRole(serverId, role.id, { permissions });
    },
    [servers, updateRole]
  );

  return {
    servers,
    loading,
    refetch: fetchServers,
    createServer,
    updateServer,
    deleteServer,
    createChannel,
    updateChannel,
    deleteChannel,
    reorderChannels,
    joinServer,
    leaveServer,
    transferOwnership,
    updateMemberRole,
    kickMember,
    banMember,
    unbanMember,
    timeoutMember,
    createInvite,
    revokeInvite,
    fetchAuditLogs,
    fetchBans,
    fetchInvites,
    fetchServerReports,
    resolveReport,
    dismissReport,
    createRole,
    updateRole,
    deleteRole,
    updateRolePermissions,
    setChannelPermissionOverride,
  };
}

export type UseServersReturn = ReturnType<typeof useServersInternal>;

const ServersContext = React.createContext<UseServersReturn | null>(null);

export function ServersProvider({ children }: { children: React.ReactNode }) {
  const value = useServersInternal();
  return React.createElement(ServersContext.Provider, { value }, children);
}

export function useServers(): UseServersReturn {
  const context = React.useContext(ServersContext);
  if (!context) {
    return {
      servers: [],
      activeServer: null,
      channels: [],
      isLoading: false,
      error: null,
      fetchServers: async () => {},
      createServer: async () => ({ success: false }),
      updateServer: async () => ({ success: false }),
      deleteServer: async () => ({ success: false }),
      joinServer: async () => ({ success: false }),
      leaveServer: async () => false,
      transferOwnership: async () => ({ success: false }),
      createChannel: async () => ({ success: false }),
      updateChannel: async () => ({ success: false }),
      deleteChannel: async () => ({ success: false }),
      reorderChannels: async () => ({ ok: false }),
      createInvite: async () => ({ invite: null, error: null }),
      kickMember: async () => ({ success: false }),
      banMember: async () => ({ success: false }),
      unbanMember: async () => ({ success: false }),
      timeoutMember: async () => ({ success: false, error: null }),
      getBannedUsers: async () => [],
      getAuditLogs: async () => [],
      getMemberRoles: async () => [],
      assignRole: async () => ({ success: false }),
      removeRole: async () => ({ success: false }),
      createRole: async () => ({ success: false }),
      updateRole: async () => ({ success: false }),
      deleteRole: async () => ({ success: false }),
      updateRolePermissions: async () => ({ success: false }),
      setChannelPermissionOverride: async () => ({ ok: false }),
    } as unknown as UseServersReturn;
  }
  return context;
}

export function usePermissions(serverId: string | null | undefined) {
  const { servers } = useServers();
  const { user } = useAuth();

  return React.useMemo(() => {
    if (!serverId || !user) {
      return {
        isOwner: false,
        can: () => false,
        permissions: [] as ServerPermission[],
      };
    }

    const server = servers.find((s) => s.id === serverId);
    if (!server) {
      return {
        isOwner: false,
        can: () => false,
        permissions: [] as ServerPermission[],
      };
    }

    const isOwner = server.owner_id === user.id;

    const can = (permission: ServerPermission): boolean => {
      return hasServerPermission(server, user.id, permission);
    };

    const canInChannel = (channelId: string, permission: ServerPermission): boolean => {
      return hasChannelPermission(server, channelId, user.id, permission);
    };

    const permissions = ALL_SERVER_PERMISSIONS
      .map((p) => p.id)
      .filter((p) => can(p));

    return {
      isOwner,
      can,
      canInChannel,
      permissions,
    };
  }, [servers, serverId, user]);
}
