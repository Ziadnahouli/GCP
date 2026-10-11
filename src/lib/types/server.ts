import { Profile } from './profile';

export type ServerRole = 'owner' | 'admin' | 'moderator' | 'member';

export type ChannelType = 'text' | 'voice';

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
  owner_id: string;
  created_at: string;
  channels: Channel[];
  members: ServerMember[];
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
