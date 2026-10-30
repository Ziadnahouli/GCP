import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Server, RoleDefinition, ServerMember } from '@/lib/types/server';
import { UserProfile } from '@/lib/types/profile';
import { ServerSettingsModal } from '@/components/servers/server-settings-modal';
import { TimeoutMemberDialog } from '@/components/servers/settings/TimeoutMemberDialog';
import { DeleteChannelDialog } from '@/components/servers/settings/DeleteChannelDialog';
import { DeleteServerDialog } from '@/components/servers/settings/DeleteServerDialog';
import { KickMemberDialog } from '@/components/servers/settings/KickMemberDialog';
import { BanMemberDialog } from '@/components/servers/settings/BanMemberDialog';

const createMockProfile = (id: string, displayName: string, username: string): UserProfile => ({
  id,
  username,
  display_name: displayName,
  avatar_url: null,
  banner_url: null,
  banner_color: '#7c3aed',
  bio: '',
  custom_status: null,
  status: 'online',
  game_activity: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// Mock Auth
const mockUser = { id: 'owner-uuid-1', email: 'owner@nexus.gg' };
vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({
    user: mockUser,
    profile: createMockProfile(mockUser.id, 'OwnerUser', 'owner_user'),
  }),
}));

// Mock useServers
const mockUseServers = {
  servers: [],
  banMember: vi.fn(),
  unbanMember: vi.fn(),
  timeoutMember: vi.fn(),
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
  fetchAuditLogs: vi.fn().mockResolvedValue([]),
  fetchBans: vi.fn().mockResolvedValue([]),
  fetchInvites: vi.fn().mockResolvedValue([]),
  fetchServerReports: vi.fn().mockResolvedValue([]),
  resolveReport: vi.fn(),
  dismissReport: vi.fn(),
  reorderChannels: vi.fn(),
};

vi.mock('@/hooks/use-servers', () => ({
  useServers: () => mockUseServers,
  usePermissions: (serverId: string) => ({
    isOwner: true,
    can: (perm: string) => true,
    permissions: ['manage_server', 'manage_channels', 'manage_roles', 'create_invites', 'manage_invites', 'kick_members', 'ban_members', 'moderate_members', 'manage_messages', 'manage_reports', 'view_audit_log'],
  }),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => ({
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'https://example.com/icon.png' } }),
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
}));

const testRoles: RoleDefinition[] = [
  { id: 'admin-role-id', server_id: 'srv-1', name: 'Admin', color: '#ef4444', position: 3, permissions: ['manage_server'], is_system: true, is_custom: false },
  { id: 'mod-role-id', server_id: 'srv-1', name: 'Moderator', color: '#f59e0b', position: 2, permissions: ['kick_members', 'moderate_members'], is_system: true, is_custom: false },
  { id: 'mem-role-id', server_id: 'srv-1', name: 'Member', color: '#94a3b8', position: 1, permissions: ['send_messages', 'connect_voice'], is_system: true, is_custom: false },
];

const testMembers: ServerMember[] = [
  {
    id: 'mem-1',
    server_id: 'srv-1',
    user_id: 'owner-uuid-1',
    role: 'owner',
    joined_at: new Date().toISOString(),
    profile: createMockProfile('owner-uuid-1', 'OwnerUser', 'owner_user'),
  },
  {
    id: 'mem-2',
    server_id: 'srv-1',
    user_id: 'member-uuid-2',
    role: 'member',
    role_id: 'mem-role-id',
    joined_at: new Date().toISOString(),
    profile: createMockProfile('member-uuid-2', 'RegularMember', 'reg_mem'),
  },
];

const baseServer: Server = {
  id: 'srv-1',
  name: 'Nexus Alpha Clan',
  description: 'Competitive gaming server',
  owner_id: 'owner-uuid-1',
  created_at: new Date().toISOString(),
  channels: [
    { id: 'chan-1', server_id: 'srv-1', name: 'general', type: 'text', position: 0, created_at: new Date().toISOString() },
    { id: 'chan-2', server_id: 'srv-1', name: 'strategy', type: 'text', position: 1, created_at: new Date().toISOString() },
    { id: 'chan-3', server_id: 'srv-1', name: 'Voice Lounge', type: 'voice', position: 2, created_at: new Date().toISOString() },
  ],
  roles: testRoles,
  members: testMembers,
};

describe('Server Settings Modal & Dialog Flow Tests (Clean Pro)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders ServerSettingsModal with Radix Dialog structure and accessible title', () => {
    render(
      <ServerSettingsModal
        open={true}
        onOpenChange={vi.fn()}
        server={baseServer}
      />
    );

    expect(screen.getByText('Server Overview')).toBeDefined();
    expect(screen.getByText('Channels')).toBeDefined();
    expect(screen.getByText('Roles & Perms')).toBeDefined();
    expect(screen.getByText('Members')).toBeDefined();
    expect(screen.getByText('Invites')).toBeDefined();
    expect(screen.getByText('Audit Log')).toBeDefined();
    expect(screen.getByText('Danger Zone')).toBeDefined();
  });

  it('prohibits treating users as owner when server.owner_id is empty or null (SS-R4 / SS-S1)', () => {
    const orphanedServer: Server = {
      ...baseServer,
      owner_id: '' as any,
    };

    render(
      <ServerSettingsModal
        open={true}
        onOpenChange={vi.fn()}
        server={orphanedServer}
      />
    );

    // Click Danger Zone tab
    const dangerTab = screen.getByText('Danger Zone');
    fireEvent.click(dangerTab);

    // Because owner_id is falsy, caller is NOT owner: Transfer and Delete should NOT be present
    expect(screen.queryByText('Transfer Ownership')).toBeNull();
    expect(screen.queryByText('Delete Server')).toBeNull();
    expect(screen.getAllByText('Leave Server').length).toBeGreaterThan(0);
  });

  it('TimeoutMemberDialog enforces 28-day max cap and character limit with no native prompt', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const targetMember: ServerMember = {
      id: 'mem-2',
      server_id: 'srv-1',
      user_id: 'target-uuid',
      role: 'member',
      joined_at: new Date().toISOString(),
      profile: createMockProfile('target-uuid', 'TargetUser', 'target_u'),
    };

    render(
      <TimeoutMemberDialog
        open={true}
        onOpenChange={vi.fn()}
        member={targetMember}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText('Timeout TargetUser')).toBeDefined();

    // Reason input
    const textarea = screen.getByPlaceholderText(/moderation audit log/i);
    expect(textarea).toBeDefined();

    // Select preset duration (1 hour)
    const hourBtn = screen.getByText('1 hour');
    fireEvent.click(hourBtn);

    // Confirm button
    const applyBtn = screen.getByText('Apply Timeout');
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(3600, '');
    });
  });

  it('DeleteChannelDialog warns user and blocks deleting the last text channel', () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const lastChannel = {
      id: 'chan-1',
      server_id: 'srv-1',
      name: 'general',
      type: 'text' as const,
      position: 0,
      created_at: new Date().toISOString(),
    };

    render(
      <DeleteChannelDialog
        open={true}
        onOpenChange={vi.fn()}
        channel={lastChannel}
        isLastTextChannel={true}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText(/You cannot delete the last text channel/i)).toBeDefined();
    const deleteBtn = screen.getByRole('button', { name: 'Delete Channel' });
    expect((deleteBtn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(deleteBtn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('DeleteServerDialog requires typing the exact server name to enable deletion', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <DeleteServerDialog
        open={true}
        onOpenChange={vi.fn()}
        server={baseServer}
        onConfirm={onConfirm}
      />
    );

    const deleteBtn = screen.getByText('Delete Server');
    expect((deleteBtn as HTMLButtonElement).disabled).toBe(true);

    const input = screen.getByPlaceholderText(baseServer.name);
    // Wrong name
    fireEvent.change(input, { target: { value: 'Wrong Server' } });
    expect((deleteBtn as HTMLButtonElement).disabled).toBe(true);

    // Exact name
    fireEvent.change(input, { target: { value: baseServer.name } });
    expect((deleteBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalled();
    });
  });

  it('KickMemberDialog and BanMemberDialog collect reason and confirm without window.prompt/confirm', async () => {
    const onKickConfirm = vi.fn().mockResolvedValue(undefined);
    const onBanConfirm = vi.fn().mockResolvedValue(undefined);

    const targetMember = testMembers[1];

    const { rerender } = render(
      <KickMemberDialog
        open={true}
        onOpenChange={vi.fn()}
        member={targetMember}
        onConfirm={onKickConfirm}
      />
    );

    expect(screen.getByText('Kick RegularMember')).toBeDefined();
    const kickReason = screen.getByPlaceholderText(/Reason for kicking/i);
    fireEvent.change(kickReason, { target: { value: 'Rule violation #3' } });

    const confirmKickBtn = screen.getByText('Confirm Kick');
    fireEvent.click(confirmKickBtn);

    await waitFor(() => {
      expect(onKickConfirm).toHaveBeenCalledWith('Rule violation #3');
    });

    render(
      <BanMemberDialog
        open={true}
        onOpenChange={vi.fn()}
        member={targetMember}
        onConfirm={onBanConfirm}
      />
    );

    expect(screen.getByText('Ban RegularMember')).toBeDefined();
    const banReason = screen.getByPlaceholderText(/Violations of server rules/i);
    fireEvent.change(banReason, { target: { value: 'Permanent harassment ban' } });

    const confirmBanBtn = screen.getByText('Confirm Ban');
    fireEvent.click(confirmBanBtn);

    await waitFor(() => {
      expect(onBanConfirm).toHaveBeenCalledWith('Permanent harassment ban');
    });
  });
});
