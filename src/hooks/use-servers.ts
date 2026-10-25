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
} from '@/lib/types/server';
import { useAuth } from '@/features/auth/auth-provider';
import { supabase } from '@/lib/supabase/client';
import { UserProfile } from '@/lib/types/profile';
import { realtimeHub } from '@/lib/realtime/realtime-hub';

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
          server_members (
            id, server_id, user_id, role, joined_at, timeout_until,
            profile:user_id (
              id, username, display_name, avatar_url, banner_url, banner_color,
              bio, custom_status, status, game_activity, created_at, updated_at
            )
          )
        `);

      if (!error && srvData) {
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
            const channels = (s.channels || []).sort((a: Channel, b: Channel) => a.position - b.position);

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
                timeout_until: m.timeout_until || null,
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
      .on('broadcast', { event: 'servers_update' }, () => {
        fetchServers();
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
              profile:user_id (
                id, username, display_name, avatar_url, banner_url, banner_color,
                bio, custom_status, status, game_activity, created_at, updated_at
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
          const { error: updateErr } = await supabase
            .from('server_members')
            .update({ role: newRole })
            .eq('server_id', serverId)
            .eq('user_id', userId);
          if (updateErr) {
            console.error('Failed to update member role:', updateErr);
            saveServersRef.current(servers);
            return false;
          }
          notifyServersUpdate();
          return true;
        } catch (err) {
          console.error('Error updating member role:', err);
          saveServersRef.current(servers);
          return false;
        }
      }
      return true;
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
        await fetchServers();
        return { success: true, error: null };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to ban member' };
      }
    },
    [user, fetchServers]
  );

  const unbanMember = React.useCallback(
    async (
      serverId: string,
      userId: string,
      restoreMember = true
    ): Promise<{ success: boolean; error: string | null }> => {
      if (!user || !supabase) return { success: false, error: 'Not authenticated' };
      try {
        const { error } = await supabase.rpc('unban_server_member', {
          p_server_id: serverId,
          p_user_id: userId,
          p_restore_member: restoreMember,
        });
        if (error) throw error;
        await fetchServers();
        notifyServersUpdate();
        return { success: true, error: null };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to unban member' };
      }
    },
    [user, fetchServers, supabase]
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
        if (error) throw error;
        await fetchServers();
        return { success: true, error: null };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to timeout member' };
      }
    },
    [user, fetchServers, supabase]
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
        if (error) throw error;
        return { invite: data as ServerInvite, error: null };
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
