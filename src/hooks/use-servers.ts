'use client';

import * as React from 'react';
import { Server, Channel, ChannelType } from '@/lib/types/server';
import { useAuth } from '@/features/auth/auth-provider';
import { supabase } from '@/lib/supabase/client';
import { UserProfile } from '@/lib/types/profile';

const STORAGE_KEY = 'nexus_gaming_servers_store';

const DEFAULT_SERVERS: Server[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Tactical Squad Alpha',
    description: 'Competitive tactical FPS squad & scrims headquarters.',
    icon_url: null,
    owner_id: null,
    created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
    channels: [
      {
        id: '00000000-0000-0000-0001-000000000001',
        server_id: '00000000-0000-0000-0000-000000000001',
        name: 'general',
        type: 'text',
        topic: 'General chatter & gaming discussions.',
        position: 0,
        created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
      },
      {
        id: '00000000-0000-0000-0001-000000000002',
        server_id: '00000000-0000-0000-0000-000000000001',
        name: 'tactics-and-strats',
        type: 'text',
        topic: 'Lineups, execute timings, and map callouts.',
        position: 1,
        created_at: new Date(Date.now() - 86400000 * 25).toISOString(),
      },
      {
        id: '00000000-0000-0000-0001-000000000003',
        server_id: '00000000-0000-0000-0000-000000000001',
        name: 'highlights-and-clips',
        type: 'text',
        topic: 'Ace clips, funny moments, and plays of the game.',
        position: 2,
        created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
      },
      {
        id: '00000000-0000-0000-0001-000000000004',
        server_id: '00000000-0000-0000-0000-000000000001',
        name: 'Squad Lounge 1',
        type: 'voice',
        topic: 'Casual hangout voice room.',
        position: 3,
        created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
      },
      {
        id: '00000000-0000-0000-0001-000000000005',
        server_id: '00000000-0000-0000-0000-000000000001',
        name: 'Competitive Scrims',
        type: 'voice',
        topic: 'Ranked scrim comms only.',
        position: 4,
        created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
      },
    ],
    members: [],
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Cyber Ranked Grinders',
    description: 'High-ELO competitive matchmaking and aim lab analysis.',
    icon_url: null,
    owner_id: null,
    created_at: new Date(Date.now() - 86400000 * 15).toISOString(),
    channels: [
      {
        id: '00000000-0000-0000-0002-000000000001',
        server_id: '00000000-0000-0000-0000-000000000002',
        name: 'lobby-chat',
        type: 'text',
        topic: 'LFG and rank announcements.',
        position: 0,
        created_at: new Date(Date.now() - 86400000 * 15).toISOString(),
      },
      {
        id: '00000000-0000-0000-0002-000000000002',
        server_id: '00000000-0000-0000-0000-000000000002',
        name: 'Duo Queue Voice',
        type: 'voice',
        topic: 'Duo ranked voice comms.',
        position: 1,
        created_at: new Date(Date.now() - 86400000 * 15).toISOString(),
      },
    ],
    members: [],
  },
];

export function useServers() {
  const { user, profile } = useAuth();
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
          server_members (
            id, server_id, user_id, role, joined_at,
            profile:user_id (
              id, username, display_name, avatar_url, banner_url, banner_color,
              bio, custom_status, status, game_activity, created_at, updated_at
            )
          )
        `);

      if (!error && srvData && srvData.length > 0) {
        const parsed: Server[] = srvData.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          icon_url: s.icon_url,
          owner_id: s.owner_id,
          created_at: s.created_at,
          channels: (s.channels || []).sort(
            (a: Channel, b: Channel) => a.position - b.position
          ),
          members: (s.server_members || []).map((m: any) => ({
            id: m.id,
            server_id: m.server_id,
            user_id: m.user_id,
            role: m.role,
            joined_at: m.joined_at,
            profile: (m.profile as unknown as UserProfile) || undefined,
          })),
        }));

        setServers(parsed);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        } catch {}
      }
    } catch (e) {
      console.warn('Failed to fetch servers from Supabase:', e);
    }
  }, [user]);

  // Initialize and load persisted servers + Realtime subscription
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setServers(JSON.parse(stored));
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

    return () => {
      clearInterval(autoSyncTimer);
      serversChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [fetchServers, user]);

  const saveServers = (updated: Server[]) => {
    setServers(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to cache servers:', e);
    }
  };

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
      saveServers(updated);

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

      saveServers(updated);

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

      saveServers(updated);

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

      saveServers(updated);

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
      const updated = servers.map((srv) => {
        if (srv.id === serverId) {
          return {
            ...srv,
            channels: srv.channels.filter((c) => c.id !== channelId),
          };
        }
        return srv;
      });

      saveServers(updated);

      if (user && supabase) {
        try {
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
      saveServers(updated);

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

      const cleaned = serverIdOrInvite
        .trim()
        .replace(/^https?:\/\/[^\/]+\/join\//i, '')
        .replace(/^nexus:\/\/join\//i, '')
        .trim();

      // Check if already in servers list
      const existing = servers.find(
        (s) =>
          s.id.toLowerCase() === cleaned.toLowerCase() ||
          s.name.toLowerCase() === cleaned.toLowerCase()
      );
      if (existing) {
        return { success: true, server: existing };
      }

      if (user && supabase) {
        try {
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
            .eq('id', cleaned)
            .single();

          if (srvErr || !srvData) {
            return { success: false, error: 'Server not found with this ID or Invite Link.' };
          }

          const memberId =
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `00000000-0000-4000-8005-${Date.now().toString(16).padStart(12, '0')}`;

          await supabase.from('server_members').upsert({
            id: memberId,
            server_id: srvData.id,
            user_id: user.id,
            role: 'member',
          });

          const newMember = {
            id: memberId,
            server_id: srvData.id,
            user_id: user.id,
            role: 'member' as const,
            joined_at: new Date().toISOString(),
            profile: profile || undefined,
          };

          const parsedServer: Server = {
            id: srvData.id,
            name: srvData.name,
            description: srvData.description,
            icon_url: srvData.icon_url,
            owner_id: srvData.owner_id,
            created_at: srvData.created_at,
            channels: (srvData.channels || []).sort(
              (a: Channel, b: Channel) => a.position - b.position
            ),
            members: [
              ...(srvData.server_members || []).map((m: any) => ({
                id: m.id,
                server_id: m.server_id,
                user_id: m.user_id,
                role: m.role,
                joined_at: m.joined_at,
                profile: m.profile || undefined,
              })),
              newMember,
            ],
          };

          const updated = [...servers.filter((s) => s.id !== parsedServer.id), parsedServer];
          saveServers(updated);
          notifyServersUpdate();
          return { success: true, server: parsedServer };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to join server.' };
        }
      }

      return { success: false, error: 'Please sign in to join squad servers.' };
    },
    [servers, user, profile, notifyServersUpdate]
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
      saveServers(updated);

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

      saveServers(updated);

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

      saveServers(updated);

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

  return {
    servers,
    loading,
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
  };
}
