import { Profile } from './profile';

export type ServerRole = 'owner' | 'admin' | 'moderator' | 'member' | string;

export type ChannelType = 'text' | 'voice';

export type ServerPermission =
  | 'manage_server'      // Rename, edit description, delete server
  | 'manage_channels'    // Create, edit, delete text & voice channels
  | 'manage_roles'       // Create, edit roles & configure permissions
  | 'kick_members'       // Kick members from server
  | 'send_messages'      // Send messages in text channels
  | 'manage_messages'    // Delete/moderate messages
  | 'connect_voice'      // Join voice lounges
  | 'speak_voice'        // Unmute and talk in voice lounges
  | 'share_screen'       // Stream screen & webcam video in voice lounges
  | 'use_soundboard';    // Play soundboard memes

export interface RoleDefinition {
  id: string;
  name: string;
  color?: string;
  permissions: ServerPermission[];
  is_custom?: boolean;
}

export const ALL_SERVER_PERMISSIONS: { id: ServerPermission; label: string; description: string; category: 'General' | 'Text' | 'Voice' }[] = [
  { id: 'manage_server', label: 'Manage Server', description: 'Change server name, description, and settings.', category: 'General' },
  { id: 'manage_channels', label: 'Manage Channels', description: 'Create, edit, and delete text and voice channels.', category: 'General' },
  { id: 'manage_roles', label: 'Manage Roles', description: 'Create roles, assign permissions, and grant roles.', category: 'General' },
  { id: 'kick_members', label: 'Kick Members', description: 'Remove disruptive players from the server.', category: 'General' },
  { id: 'send_messages', label: 'Send Messages', description: 'Post text messages and tactical callouts.', category: 'Text' },
  { id: 'manage_messages', label: 'Manage Messages', description: 'Delete messages sent by other players.', category: 'Text' },
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
    'kick_members',
    'send_messages',
    'manage_messages',
    'connect_voice',
    'speak_voice',
    'share_screen',
    'use_soundboard',
  ],
  admin: [
    'manage_server',
    'manage_channels',
    'manage_roles',
    'kick_members',
    'send_messages',
    'manage_messages',
    'connect_voice',
    'speak_voice',
    'share_screen',
    'use_soundboard',
  ],
  moderator: [
    'manage_channels',
    'kick_members',
    'send_messages',
    'manage_messages',
    'connect_voice',
    'speak_voice',
    'share_screen',
    'use_soundboard',
  ],
  member: [
    'send_messages',
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

  // 1. Check custom roles configured on server
  if (server.roles && server.roles.length > 0) {
    const customRole = server.roles.find(
      (r) => r.id === member.role || r.name.toLowerCase() === member.role.toLowerCase()
    );
    if (customRole) {
      return customRole.permissions.includes(permission);
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
  joined_at: string;
  profile?: Profile;
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
}

export interface ChannelMessage {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  profile?: Profile;
  status?: 'sending' | 'sent' | 'failed';
  error?: string;
}
