'use client';

import * as React from 'react';
import { Server, Channel, ChannelType, RoleDefinition, ServerPermission } from '@/lib/types/server';
import { useAuth } from '@/features/auth/auth-provider';
import { supabase } from '@/lib/supabase/client';
import { UserProfile } from '@/lib/types/profile';

const STORAGE_KEY = 'nexus_gaming_servers_store';
const DELETED_CHANS_KEY = 'nexus_deleted_channels_store';

const DUMMY_SERVER_IDS = new Set<string>();

const getDeletedChannelIds = (): Set<string> => {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(DELETED_CHANS_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
};

const markChannelDeleted = (channelId: string) => {
  if (typeof window === 'undefined') return;
  try {
    const set = getDeletedChannelIds();
    set.add(channelId);
    localStorage.setItem(DELETED_CHANS_KEY, JSON.stringify(Array.from(set)));
  } catch {}
};

const DEFAULT_SERVERS: Server[] = [];

export function useServersInternal() {
  const { user, profile } = useAuth();
  const [servers, setServers] = React.useState<Server[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_SERVERS;
    try {
      const userStorageKey = user ? `${STORAGE_KEY}_${user.id}` : STORAGE_KEY;
      const stored = localStorage.getItem(userStorageKey);
      if (stored) {
        const parsed: Server[] = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (s) =>
              !DUMMY_SERVER_IDS.has(s.id) &&
              (s.owner_id === user?.id || (s.members || []).some((m) => m.user_id === user?.id) || s.owner_id === null)
          );
        }
      }
    } catch {}
    return DEFAULT_SERVERS;
  });
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
          server_members (
            id, server_id, user_id, role, joined_at,
            profile:user_id (
              id, username, display_name, avatar_url, banner_url, banner_color,
              bio, custom_status, status, game_activity, created_at, updated_at
            )
          )
        `);

      if (!error && srvData) {
        const deletedChans = getDeletedChannelIds();
        const parsed: Server[] = srvData
          .filter((s) => !DUMMY_SERVER_IDS.has(s.id))
          // Show servers where user is the owner, a member, or public community servers
          .filter((s) => {
            const isOwner = s.owner_id === user.id;
            const isMember = (s.server_members || []).some((m: any) => m.user_id === user.id);
            const isPublic = s.owner_id === null;
            return isOwner || isMember || isPublic;
          })
          .map((s) => {
            const rawChannels = (s.channels || []).filter((c: Channel) => !deletedChans.has(c.id));
            const channels =
              rawChannels.length > 0
                ? rawChannels.sort((a: Channel, b: Channel) => a.position - b.position)
                : [
                    {
                      id: `default-chan-${s.id}`,
                      server_id: s.id,
                      name: 'general',
                      type: 'text' as const,
                      topic: 'General team discussion & lobby chatter',
                      position: 0,
                      created_at: s.created_at || new Date().toISOString(),
                    },
                    {
                      id: `default-voice-${s.id}`,
                      server_id: s.id,
                      name: 'Voice Lounge',
                      type: 'voice' as const,
                      topic: 'Instant squad voice comms',
                      position: 1,
                      created_at: s.created_at || new Date().toISOString(),
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
              members: (s.server_members || []).map((m: any) => ({
                id: m.id,
                server_id: m.server_id,
                user_id: m.user_id,
                role: m.role,
                joined_at: m.joined_at,
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
              (s.owner_id === user?.id || (s.members || []).some((m) => m.user_id === user?.id) || s.owner_id === null)
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

    const channel = supabase
      .channel('servers-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servers' }, () => {
        fetchServers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, () => {
        fetchServers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_members' }, () => {
        fetchServers();
      })
      .on('broadcast', { event: 'servers_update' }, () => {
        fetchServers();
      })
      .subscribe();

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
      supabase.removeChannel(channel);
    };
  }, [fetchServers, user]);

  const saveServers = React.useCallback(
    (updated: Server[]) => {
      const userServers = updated.filter(
        (s) =>
          !DUMMY_SERVER_IDS.has(s.id) &&
          (s.owner_id === user?.id || (s.members || []).some((m) => m.user_id === user?.id) || s.owner_id === null)
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
    ): Promise<Server | null> => {
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

      saveServersRef.current(updated);

      if (user && supabase && updatedServer) {
        try {
          await supabase
            .from('servers')
            .update({
              name: (updatedServer as Server).name,
              description: (updatedServer as Server).description,
              icon_url: (updatedServer as Server).icon_url,
            })
            .eq('id', serverId);
          notifyServersUpdate();
        } catch (e) {
          console.warn('Supabase server update failed:', e);
        }
      }

      return updatedServer;
    },
    [servers, user, notifyServersUpdate]
  );

  const createChannel = React.useCallback(
    async (serverId: string, name: string, type: ChannelType = 'text', topic?: string) => {
      const channelId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `00000000-0000-4000-8004-${Date.now().toString(16).padStart(12, '0')}`;
      const cleanName =
        type === 'text'
          ? name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '')
          : name.trim();

      const newChannel: Channel = {
        id: channelId,
        server_id: serverId,
        name: cleanName || (type === 'text' ? 'new-channel' : 'Voice Lounge'),
        type,
        topic: topic?.trim() || null,
        position: 99,
        created_at: new Date().toISOString(),
      };

      const updated = servers.map((srv) => {
        if (srv.id === serverId) {
          return {
            ...srv,
            channels: [...srv.channels, newChannel],
          };
        }
        return srv;
      });

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
          if (chanErr) throw chanErr;

          notifyServersUpdate();
        } catch (e) {
          console.error('Supabase channel insert failed:', e);
        }
      }

      return newChannel;
    },
    [servers, user, notifyServersUpdate]
  );

  const updateChannel = React.useCallback(
    async (
      serverId: string,
      channelId: string,
      updates: { name?: string; topic?: string | null }
    ): Promise<Channel | null> => {
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

      saveServersRef.current(updated);

      if (user && supabase && updatedChan) {
        try {
          await supabase
            .from('channels')
            .update({
              name: (updatedChan as Channel).name,
              topic: (updatedChan as Channel).topic,
            })
            .eq('id', channelId);
          notifyServersUpdate();
        } catch (e) {
          console.warn('Supabase channel update failed:', e);
        }
      }

      return updatedChan;
    },
    [servers, user, notifyServersUpdate]
  );

  const deleteChannel = React.useCallback(
    async (serverId: string, channelId: string) => {
      markChannelDeleted(channelId);

      const updated = servers.map((srv) => {
        if (srv.id === serverId) {
          return {
            ...srv,
            channels: srv.channels.filter((c) => c.id !== channelId),
          };
        }
        return srv;
      });

      saveServersRef.current(updated);

      if (user && supabase) {
        try {
          // Delete messages first to satisfy foreign keys
          await supabase.from('channel_messages').delete().eq('channel_id', channelId);
          await supabase.from('channels').delete().eq('id', channelId);
          notifyServersUpdate();
        } catch (e) {
          console.warn('Supabase channel delete failed:', e);
        }
      }
    },
    [servers, user, notifyServersUpdate]
  );

  const deleteServer = React.useCallback(
    async (serverId: string) => {
      const updated = servers.filter((s) => s.id !== serverId);
      saveServersRef.current(updated);

      if (user && supabase) {
        try {
          await supabase.from('servers').delete().eq('id', serverId);
          notifyServersUpdate();
        } catch (e) {
          console.warn('Supabase server delete failed:', e);
        }
      }
    },
    [servers, user, notifyServersUpdate]
  );

  const joinServer = React.useCallback(
    async (serverIdOrInvite: string): Promise<{ success: boolean; server?: Server; error?: string }> => {
      if (!serverIdOrInvite?.trim()) {
        return { success: false, error: 'Please enter a valid Server ID or Invite Link.' };
      }

      // Robust UUID extraction from any URL format (?join=UUID, /join/UUID, or direct UUID)
      const uuidMatch = serverIdOrInvite.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      const targetId = uuidMatch ? uuidMatch[0] : serverIdOrInvite.trim();

      // Check if already in servers list
      const existing = servers.find(
        (s) =>
          s.id.toLowerCase() === targetId.toLowerCase() ||
          s.name.toLowerCase() === targetId.toLowerCase()
      );
      if (existing) {
        return { success: true, server: existing };
      }

      if (user && supabase) {
        try {
          const memberId =
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `00000000-0000-4000-8005-${Date.now().toString(16).padStart(12, '0')}`;

          // Add membership first so RLS policies allow querying the server
          try {
            await supabase.from('server_members').upsert({
              id: memberId,
              server_id: targetId,
              user_id: user.id,
              role: 'member',
            });
          } catch {}

          try {
            await supabase.rpc('join_server_by_id', { target_server_id: targetId });
          } catch {}

          const { data: srvData, error: srvErr } = await supabase
            .from('servers')
            .select(`
              id, name, description, icon_url, owner_id, created_at,
              channels ( id, server_id, name, type, topic, position, created_at ),
              server_members (
                id, server_id, user_id, role, joined_at,
                profile:user_id (
                  id, username, display_name, avatar_url, banner_url, banner_color,
                  bio, custom_status, status, game_activity, created_at, updated_at
                )
              )
            `)
            .eq('id', targetId)
            .single();

          if (srvErr || !srvData) {
            return { success: false, error: 'Server not found with this ID or Invite Link.' };
          }

          const deletedChans = getDeletedChannelIds();
          const parsedServer: Server = {
            id: srvData.id,
            name: srvData.name,
            description: srvData.description,
            icon_url: srvData.icon_url,
            owner_id: srvData.owner_id,
            created_at: srvData.created_at,
            channels: (srvData.channels || [])
              .filter((c: Channel) => !deletedChans.has(c.id))
              .sort((a: Channel, b: Channel) => a.position - b.position),
            members: [
              ...(srvData.server_members || []).map((m: any) => ({
                id: m.id,
                server_id: m.server_id,
                user_id: m.user_id,
                role: m.role,
                joined_at: m.joined_at,
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
      }

      return { success: false, error: 'Please sign in to join squad servers.' };
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
          await supabase
            .from('server_members')
            .delete()
            .eq('server_id', serverId)
            .eq('user_id', user.id);
          notifyServersUpdate();
        } catch {}
      }
      return true;
    },
    [servers, user, notifyServersUpdate]
  );

  const updateMemberRole = React.useCallback(
    async (serverId: string, userId: string, newRole: Server['members'][0]['role']): Promise<boolean> => {
      const updated = servers.map((srv) => {
        if (srv.id === serverId) {
          return {
            ...srv,
            members: srv.members.map((m) => (m.user_id === userId ? { ...m, role: newRole } : m)),
          };
        }
        return srv;
      });

      saveServersRef.current(updated);

      if (user && supabase) {
        try {
          await supabase
            .from('server_members')
            .update({ role: newRole })
            .eq('server_id', serverId)
            .eq('user_id', userId);
          notifyServersUpdate();
          return true;
        } catch {
          return false;
        }
      }
      return true;
    },
    [servers, user, notifyServersUpdate]
  );

  const kickMember = React.useCallback(
    async (serverId: string, userId: string): Promise<boolean> => {
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
          await supabase
            .from('server_members')
            .delete()
            .eq('server_id', serverId)
            .eq('user_id', userId);
          notifyServersUpdate();
          return true;
        } catch {
          return false;
        }
      }
      return true;
    },
    [servers, user, notifyServersUpdate]
  );

  const createRole = React.useCallback(
    async (
      serverId: string,
      name: string,
      color: string,
      permissions: ServerPermission[]
    ): Promise<RoleDefinition> => {
      const roleId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `role-${Date.now().toString(16)}`;

      const newRole: RoleDefinition = {
        id: roleId,
        name,
        color,
        permissions,
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

      saveServersRef.current(updated);
      notifyServersUpdate();
      return newRole;
    },
    [servers, notifyServersUpdate]
  );

  const updateRole = React.useCallback(
    async (
      serverId: string,
      roleId: string,
      updates: Partial<RoleDefinition>
    ): Promise<boolean> => {
      const updated = servers.map((srv) => {
        if (srv.id === serverId) {
          const roles = (srv.roles || []).map((r) =>
            r.id === roleId ? { ...r, ...updates } : r
          );
          return { ...srv, roles };
        }
        return srv;
      });

      saveServersRef.current(updated);
      notifyServersUpdate();
      return true;
    },
    [servers, notifyServersUpdate]
  );

  const deleteRole = React.useCallback(
    async (serverId: string, roleId: string): Promise<boolean> => {
      const updated = servers.map((srv) => {
        if (srv.id === serverId) {
          const roles = (srv.roles || []).filter((r) => r.id !== roleId);
          const members = srv.members.map((m) =>
            m.role === roleId ? { ...m, role: 'member' } : m
          );
          return { ...srv, roles, members };
        }
        return srv;
      });

      saveServersRef.current(updated);
      notifyServersUpdate();
      return true;
    },
    [servers, notifyServersUpdate]
  );

  const updateRolePermissions = React.useCallback(
    async (
      serverId: string,
      roleIdOrName: string,
      permissions: ServerPermission[]
    ): Promise<boolean> => {
      const updated = servers.map((srv) => {
        if (srv.id === serverId) {
          const existingRoles = [...(srv.roles || [])];
          const roleIdx = existingRoles.findIndex(
            (r) => r.id === roleIdOrName || r.name.toLowerCase() === roleIdOrName.toLowerCase()
          );
          if (roleIdx >= 0) {
            existingRoles[roleIdx] = {
              ...existingRoles[roleIdx],
              permissions,
            };
          } else {
            existingRoles.push({
              id: roleIdOrName.toLowerCase(),
              name: roleIdOrName.charAt(0).toUpperCase() + roleIdOrName.slice(1),
              permissions,
              color: '#6366f1',
              is_custom: false,
            });
          }
          return { ...srv, roles: existingRoles };
        }
        return srv;
      });

      saveServersRef.current(updated);
      notifyServersUpdate();
      return true;
    },
    [servers, notifyServersUpdate]
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
    joinServer,
    leaveServer,
    updateMemberRole,
    kickMember,
    createRole,
    updateRole,
    deleteRole,
    updateRolePermissions,
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
    throw new Error('useServers must be used within a ServersProvider');
  }
  return context;
}
