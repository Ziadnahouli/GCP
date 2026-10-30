import { Profile } from './profile';

export type ServerRole = 'owner' | 'admin' | 'moderator' | 'member' | string;

export type ChannelType = 'text' | 'voice';

export type ServerPermission =
  | 'manage_server'      // Rename, edit description, delete server
  | 'manage_channels'    // Create, edit, delete text & voice channels
  | 'manage_roles'       // Create, edit roles & configure permissions
  | 'manage_invites'     // View and revoke server invite links
  | 'create_invites'     // Create new invite links
  | 'kick_members'       // Kick members from server
  | 'ban_members'        // Permanently ban members
  | 'moderate_members'   // Timeout / mute members
  | 'manage_messages'    // Delete/moderate messages
  | 'manage_reports'     // Review and resolve reports
  | 'view_audit_log'     // View moderation audit trail
  | 'send_messages'      // Send messages in text channels
  | 'send_attachments'   // Upload files and images
  | 'mention_everyone'   // Mention @everyone and @here
  | 'connect_voice'      // Join voice lounges
  | 'speak_voice'        // Unmute and talk in voice lounges
  | 'share_screen'       // Stream screen & webcam video in voice lounges
  | 'use_soundboard';    // Play soundboard memes

export interface MutationResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

export interface RoleDefinition {
  id: string;
  server_id?: string;
  name: string;
  color?: string;
  position?: number;
  permissions: ServerPermission[];
  is_system?: boolean;
  is_custom?: boolean;
}

export const ALL_SERVER_PERMISSIONS: { id: ServerPermission; label: string; description: string; category: 'General' | 'Membership' | 'Text' | 'Voice' }[] = [
  { id: 'manage_server', label: 'Manage Server', description: 'Change server name, description, icon, and settings.', category: 'General' },
  { id: 'manage_channels', label: 'Manage Channels', description: 'Create, edit, and delete text and voice channels.', category: 'General' },
  { id: 'manage_roles', label: 'Manage Roles', description: 'Create roles, assign permissions, and grant roles.', category: 'General' },
  { id: 'view_audit_log', label: 'View Audit Log', description: 'View audit logs of moderator and administrator actions.', category: 'General' },
  { id: 'manage_invites', label: 'Manage Invites', description: 'View and revoke server invite links.', category: 'Membership' },
  { id: 'create_invites', label: 'Create Invites', description: 'Create new invite links for this server.', category: 'Membership' },
  { id: 'kick_members', label: 'Kick Members', description: 'Remove disruptive players from the server.', category: 'Membership' },
  { id: 'ban_members', label: 'Ban Members', description: 'Permanently ban disruptive users from the server.', category: 'Membership' },
  { id: 'moderate_members', label: 'Moderate Members (Timeout)', description: 'Apply and lift timeouts on members.', category: 'Membership' },
  { id: 'manage_reports', label: 'Manage Reports', description: 'Review, resolve, and dismiss server reports.', category: 'Membership' },
  { id: 'send_messages', label: 'Send Messages', description: 'Post text messages and tactical callouts.', category: 'Text' },
  { id: 'send_attachments', label: 'Attach Files', description: 'Upload attachments and screenshots in channels.', category: 'Text' },
  { id: 'manage_messages', label: 'Manage Messages', description: 'Delete messages sent by other players.', category: 'Text' },
  { id: 'mention_everyone', label: 'Mention Everyone', description: 'Trigger notifications with @everyone and @here.', category: 'Text' },
  { id: 'connect_voice', label: 'Connect to Voice', description: 'Join voice lounges and listen to comms.', category: 'Voice' },
  { id: 'speak_voice', label: 'Speak in Voice', description: 'Unmute microphone and talk in voice lounges.', category: 'Voice' },
  { id: 'share_screen', label: 'Share Screen & Video', description: 'Stream game screen or share webcam video.', category: 'Voice' },
  { id: 'use_soundboard', label: 'Use Soundboard', description: 'Play soundboard audio clips in voice lounge.', category: 'Voice' },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<'owner' | 'admin' | 'moderator' | 'member', ServerPermission[]> = {
  owner: [
    'manage_server',
    'manage_channels',
    'manage_roles',
    'manage_invites',
    'create_invites',
    'kick_members',
    'ban_members',
    'moderate_members',
    'manage_messages',
    'manage_reports',
    'view_audit_log',
    'send_messages',
    'send_attachments',
    'mention_everyone',
    'connect_voice',
    'speak_voice',
    'share_screen',
    'use_soundboard',
  ],
  admin: [
    'manage_server',
    'manage_channels',
    'manage_roles',
    'manage_invites',
    'create_invites',
    'kick_members',
    'ban_members',
    'moderate_members',
    'manage_messages',
    'manage_reports',
    'view_audit_log',
    'send_messages',
    'send_attachments',
    'mention_everyone',
    'connect_voice',
    'speak_voice',
    'share_screen',
    'use_soundboard',
  ],
  moderator: [
    'manage_channels',
    'create_invites',
    'kick_members',
    'moderate_members',
    'manage_messages',
    'manage_reports',
    'view_audit_log',
    'send_messages',
    'send_attachments',
    'mention_everyone',
    'connect_voice',
    'speak_voice',
    'share_screen',
    'use_soundboard',
  ],
  member: [
    'create_invites',
    'send_messages',
    'send_attachments',
    'connect_voice',
    'speak_voice',
    'share_screen',
    'use_soundboard',
  ],
};

export function hasServerPermission(
  server: Server | null | undefined,
  userId: string | null | undefined,
  permission: ServerPermission
): boolean {
  if (!server) return false;
  // If no userId provided, allow standard voice/chat participation for preview
  if (!userId) {
    return permission === 'connect_voice' || permission === 'speak_voice' || permission === 'send_messages';
  }
  // Server owner always has all permissions
  if (server.owner_id === userId) return true;

  const member = server.members?.find((m) => m.user_id === userId);
  if (!member) {
    // Fallback for regular members if member array hasn't synced
    return DEFAULT_ROLE_PERMISSIONS.member.includes(permission);
  }

  // Check if member is currently timed out
  if (member.timeout_until && new Date(member.timeout_until) > new Date()) {
    if (['send_messages', 'send_attachments', 'speak_voice', 'share_screen', 'use_soundboard', 'mention_everyone'].includes(permission)) {
      return false;
    }
  }

  // 1. Check custom or DB roles configured on server
  if (server.roles && server.roles.length > 0) {
    const roleDef = server.roles.find(
      (r) => (member.role_id && r.id === member.role_id) || r.id === member.role || r.name.toLowerCase() === member.role.toLowerCase()
    );
    if (roleDef) {
      return roleDef.permissions.includes(permission);
    }
  }

  // 2. Check built-in roles
  const builtInRole = member.role as 'owner' | 'admin' | 'moderator' | 'member';
  const perms = DEFAULT_ROLE_PERMISSIONS[builtInRole];
  if (perms) {
    return perms.includes(permission);
  }

  // Fallback for regular members
  return DEFAULT_ROLE_PERMISSIONS.member.includes(permission);
}

export interface Channel {
  id: string;
  server_id: string;
  name: string;
  type: ChannelType;
  topic?: string | null;
  position: number;
  created_at: string;
}

export interface ServerMember {
  id: string;
  server_id: string;
  user_id: string;
  role: ServerRole;
  role_id?: string | null;
  joined_at: string;
  timeout_until?: string | null;
  profile?: Profile;
}

export interface ServerBan {
  id: string;
  server_id: string;
  user_id: string;
  banned_by: string;
  reason?: string | null;
  created_at: string;
  profile?: Profile;
  banner_profile?: Profile;
}

export type ModerationAuditAction =
  | 'kick'
  | 'ban'
  | 'unban'
  | 'timeout'
  | 'untimeout'
  | 'delete_message'
  | 'revoke_invite'
  | 'create_invite'
  | 'update_server'
  | 'transfer_ownership'
  | 'create_channel'
  | 'update_channel'
  | 'delete_channel'
  | 'reorder_channels'
  | 'create_role'
  | 'update_role'
  | 'delete_role'
  | 'update_member_role'
  | 'resolve_report'
  | 'member_join'
  | 'member_leave';

export interface ModerationAuditLog {
  id: string;
  server_id: string;
  actor_id: string;
  target_id?: string | null;
  action: ModerationAuditAction;
  reason?: string | null;
  details?: Record<string, any>;
  created_at: string;
  actor?: Profile;
  target?: Profile;
}

export interface ServerInvite {
  id: string;
  server_id: string;
  code: string;
  created_by: string;
  max_uses: number;
  uses: number;
  expires_at?: string | null;
  is_revoked: boolean;
  created_at: string;
}

export interface ReportItem {
  id: string;
  reporter_id: string;
  reported_user_id?: string | null;
  reported_message_id?: string | null;
  reason: string;
  details?: string | null;
  status: 'pending' | 'resolved' | 'dismissed';
  created_at: string;
}

export interface Server {
  id: string;
  name: string;
  description?: string | null;
  icon_url?: string | null;
  owner_id: string | null;
  created_at: string;
  channels: Channel[];
  members: ServerMember[];
  roles?: RoleDefinition[];
  bans?: ServerBan[];
  invites?: ServerInvite[];
}

export interface ChannelMessage {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  reply_to_id?: string | null;
  is_pinned?: boolean;
  is_edited?: boolean;
  profile?: Profile;
  status?: 'sending' | 'sent' | 'failed';
  error?: string;
  client_nonce?: string;
}
