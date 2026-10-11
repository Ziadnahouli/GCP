import { describe, it, expect, beforeEach } from 'vitest';
import { Server, Channel } from '@/lib/types/server';

describe('Gaming Servers & Channels Architecture', () => {
  let mockServer: Server;

  beforeEach(() => {
    mockServer = {
      id: 'test-server-1',
      name: 'Test Clan',
      description: 'Clan description',
      icon_url: null,
      owner_id: 'owner-123',
      created_at: new Date().toISOString(),
      channels: [
        {
          id: 'chan-1',
          server_id: 'test-server-1',
          name: 'general',
          type: 'text',
          topic: 'General chat',
          position: 0,
          created_at: new Date().toISOString(),
        },
        {
          id: 'chan-2',
          server_id: 'test-server-1',
          name: 'Voice Lounge',
          type: 'voice',
          topic: null,
          position: 1,
          created_at: new Date().toISOString(),
        },
      ],
      members: [
        {
          id: 'mem-1',
          server_id: 'test-server-1',
          user_id: 'owner-123',
          role: 'owner',
          joined_at: new Date().toISOString(),
        },
      ],
    };
  });

  it('validates server model structure and channel hierarchy', () => {
    expect(mockServer.channels).toHaveLength(2);
    expect(mockServer.channels[0].type).toBe('text');
    expect(mockServer.channels[1].type).toBe('voice');
    expect(mockServer.members[0].role).toBe('owner');
  });

  it('correctly filters text channels vs voice channels', () => {
    const textChannels = mockServer.channels.filter((c) => c.type === 'text');
    const voiceChannels = mockServer.channels.filter((c) => c.type === 'voice');

    expect(textChannels).toHaveLength(1);
    expect(textChannels[0].name).toBe('general');
    expect(voiceChannels).toHaveLength(1);
    expect(voiceChannels[0].name).toBe('Voice Lounge');
  });

  it('sanitizes text channel names appropriately', () => {
    const rawName = 'Tactics & Strats 2026';
    const cleanName = rawName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
    expect(cleanName).toBe('tactics--strats-2026');
  });

  it('handles member role hierarchy levels', () => {
    const roles: ('owner' | 'admin' | 'moderator' | 'member')[] = [
      'owner',
      'admin',
      'moderator',
      'member',
    ];
    const roleWeights = {
      owner: 4,
      admin: 3,
      moderator: 2,
      member: 1,
    };

    expect(roleWeights.owner).toBeGreaterThan(roleWeights.admin);
    expect(roleWeights.admin).toBeGreaterThan(roleWeights.moderator);
    expect(roleWeights.moderator).toBeGreaterThan(roleWeights.member);
  });
});
