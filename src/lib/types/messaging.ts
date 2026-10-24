import { UserProfile } from './profile';

export interface MessageAttachment {
  id: string;
  message_id: string;
  conversation_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  url?: string;
  created_at: string;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  has_reacted: boolean;
  users: string[]; // usernames or display names
}

export type MessageDeliveryStatus = 'sending' | 'sent' | 'failed';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  reply_to_id: string | null;
  reply_to?: Message | null;
  is_pinned: boolean;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  sender?: UserProfile;
  attachments?: MessageAttachment[];
  reactions?: MessageReaction[];
  status?: MessageDeliveryStatus;
  error?: string;
  client_nonce?: string;
}

export interface ConversationMember {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  last_read_at: string | null;
  joined_at: string;
  profile?: UserProfile;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  icon_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  members: ConversationMember[];
  last_message?: Message | null;
  unread_count?: number;
}
