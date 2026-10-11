'use client';

import * as React from 'react';
import { Server, Channel, ChannelType } from '@/lib/types/server';
import { useAuth } from '@/features/auth/auth-provider';
import { supabase } from '@/lib/supabase/client';

const STORAGE_KEY = 'nexus_gaming_servers_store';

const DEFAULT_SERVERS: Server[] = [
  {
    id: 'server-tsa',
    name: 'Tactical Squad Alpha',
    description: 'Competitive tactical FPS squad & scrims headquarters.',
    icon_url: null,
    owner_id: 'system',
    created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
    channels: [
      {
        id: 'chan-tsa-gen',
        server_id: 'server-tsa',
        name: 'general',
        type: 'text',
        topic: 'General chatter & gaming discussions.',
        position: 0,
        created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
      },
      {
        id: 'chan-tsa-strat',
        server_id: 'server-tsa',
        name: 'tactics-and-strats',
        type: 'text',
        topic: 'Lineups, execute timings, and map callouts.',
        position: 1,
        created_at: new Date(Date.now() - 86400000 * 25).toISOString(),
      },
      {
        id: 'chan-tsa-clips',
        server_id: 'server-tsa',
        name: 'highlights-and-clips',
        type: 'text',
        topic: 'Ace clips, funny moments, and plays of the game.',
        position: 2,
        created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
      },
      {
        id: 'chan-tsa-voice1',
        server_id: 'server-tsa',
        name: 'Squad Lounge 1',
        type: 'voice',
        topic: 'Casual hangout voice room.',
        position: 3,
        created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
      },
      {
        id: 'chan-tsa-voice2',
        server_id: 'server-tsa',
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
    id: 'server-crg',
    name: 'Cyber Ranked Grinders',
    description: 'High-ELO competitive matchmaking and aim lab analysis.',
    icon_url: null,
    owner_id: 'system',
    created_at: new Date(Date.now() - 86400000 * 15).toISOString(),
    channels: [
      {
        id: 'chan-crg-gen',
        server_id: 'server-crg',
        name: 'lobby-chat',
        type: 'text',
        topic: 'LFG and rank announcements.',
        position: 0,
        created_at: new Date(Date.now() - 86400000 * 15).toISOString(),
      },
      {
        id: 'chan-crg-voice1',
        server_id: 'server-crg',
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

  const fetchServers = React.useCallback(async () => {
    if (!user || !supabase) return;
    try {
      const { data: srvData, error } = await supabase
        .from('servers')
        .select(`
          id, name, description, icon_url, owner_id, created_at,
          channels ( id, server_id, name, type, topic, position, created_at ),
          server_members ( id, server_id, user_id, role, joined_at )
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
          members: (s.server_members || []).map((m: { id: string; server_id: string; user_id: string; role: 'owner' | 'admin' | 'moderator' | 'member'; joined_at: string }) => ({
            id: m.id,
            server_id: m.server_id,
            user_id: m.user_id,
            role: m.role,
            joined_at: m.joined_at,
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

    const autoSyncTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchServers();
    }, 15000);

    return () => {
      clearInterval(autoSyncTimer);
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

  const createServer = React.useCallback(
    async (name: string, description?: string, iconUrl?: string) => {
      const serverId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
      const chan1Id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `00000000-0000-4000-8001-${Date.now().toString(16).padStart(12, '0')}`;
      const chan2Id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `00000000-0000-4000-8002-${Date.now().toString(16).padStart(12, '0')}`;
      const memberId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `00000000-0000-4000-8003-${Date.now().toString(16).padStart(12, '0')}`;

      const newServer: Server = {
        id: serverId,
        name: name.trim(),
        description: description?.trim() || null,
        icon_url: iconUrl || null,
        owner_id: user?.id || 'current-user',
        created_at: new Date().toISOString(),
        channels: [
          {
            id: chan1Id,
            server_id: serverId,
            name: 'general',
            type: 'text',
            topic: 'Welcome to your new server general chat!',
            position: 0,
            created_at: new Date().toISOString(),
          },
          {
            id: chan2Id,
            server_id: serverId,
            name: 'Voice Lounge',
            type: 'voice',
            topic: 'General voice channel',
            position: 1,
            created_at: new Date().toISOString(),
          },
        ],
        members: [
          {
            id: memberId,
            server_id: serverId,
            user_id: user?.id || 'current-user',
            role: 'owner',
            joined_at: new Date().toISOString(),
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

          const { error: chanErr } = await supabase.from('channels').insert([
            {
              id: newServer.channels[0].id,
              server_id: newServer.id,
              name: 'general',
              type: 'text',
              topic: 'Welcome to your new server general chat!',
              position: 0,
            },
            {
              id: newServer.channels[1].id,
              server_id: newServer.id,
              name: 'Voice Lounge',
              type: 'voice',
              position: 1,
            },
          ]);
          if (chanErr) throw chanErr;

          supabase
            .channel('servers-realtime')
            .send({ type: 'broadcast', event: 'servers_update', payload: {} })
            .catch(() => {});
        } catch (e) {
          console.error('Supabase server insert failed:', e);
        }
      }

      return newServer;
    },
    [servers, user, profile]
  );

  const createChannel = React.useCallback(
    async (serverId: string, name: string, type: ChannelType = 'text', topic?: string) => {
      const channelId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `00000000-0000-4000-8004-${Date.now().toString(16).padStart(12, '0')}`;
      const cleanName = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');

      const newChannel: Channel = {
        id: channelId,
        server_id: serverId,
        name: cleanName || 'new-channel',
        type,
        topic: topic || null,
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

          supabase
            .channel('servers-realtime')
            .send({ type: 'broadcast', event: 'servers_update', payload: {} })
            .catch(() => {});
        } catch (e) {
          console.error('Supabase channel insert failed:', e);
        }
      }

      return newChannel;
    },
    [servers, user]
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
          supabase
            .channel('servers-realtime')
            .send({ type: 'broadcast', event: 'servers_update', payload: {} })
            .catch(() => {});
        } catch (e) {
          console.warn('Supabase channel delete failed:', e);
        }
      }
    },
    [servers, user]
  );

  const deleteServer = React.useCallback(
    async (serverId: string) => {
      const updated = servers.filter((s) => s.id !== serverId);
      saveServers(updated);

      if (user && supabase) {
        try {
          await supabase.from('servers').delete().eq('id', serverId);
          supabase
            .channel('servers-realtime')
            .send({ type: 'broadcast', event: 'servers_update', payload: {} })
            .catch(() => {});
        } catch (e) {
          console.warn('Supabase server delete failed:', e);
        }
      }
    },
    [servers, user]
  );

  return {
    servers,
    loading,
    createServer,
    createChannel,
    deleteChannel,
    deleteServer,
  };
}
