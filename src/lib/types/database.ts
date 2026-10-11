export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string;
          avatar_url: string | null;
          banner_url: string | null;
          banner_color: string | null;
          bio: string | null;
          custom_status: string | null;
          status: 'online' | 'idle' | 'dnd' | 'offline';
          game_activity: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          display_name?: string;
          avatar_url?: string | null;
          banner_url?: string | null;
          banner_color?: string | null;
          bio?: string | null;
          custom_status?: string | null;
          status?: 'online' | 'idle' | 'dnd' | 'offline';
          game_activity?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          display_name?: string;
          avatar_url?: string | null;
          banner_url?: string | null;
          banner_color?: string | null;
          bio?: string | null;
          custom_status?: string | null;
          status?: 'online' | 'idle' | 'dnd' | 'offline';
          game_activity?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      user_settings: {
        Row: {
          id: string;
          user_id: string;
          theme: 'dark' | 'light' | 'system';
          accent_color: 'violet' | 'cyan' | 'emerald' | 'crimson' | 'amber';
          sound_effects_enabled: boolean;
          push_to_talk_enabled: boolean;
          push_to_talk_key: string | null;
          input_volume: number;
          output_volume: number;
          allow_direct_messages: 'everyone' | 'friends' | 'none';
          allow_friend_requests: 'everyone' | 'friends_of_friends' | 'none';
          email_notifications: boolean;
          desktop_notifications: boolean;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          theme?: 'dark' | 'light' | 'system';
          accent_color?: 'violet' | 'cyan' | 'emerald' | 'crimson' | 'amber';
          sound_effects_enabled?: boolean;
          push_to_talk_enabled?: boolean;
          push_to_talk_key?: string | null;
          input_volume?: number;
          output_volume?: number;
          allow_direct_messages?: 'everyone' | 'friends' | 'none';
          allow_friend_requests?: 'everyone' | 'friends_of_friends' | 'none';
          email_notifications?: boolean;
          desktop_notifications?: boolean;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          theme?: 'dark' | 'light' | 'system';
          accent_color?: 'violet' | 'cyan' | 'emerald' | 'crimson' | 'amber';
          sound_effects_enabled?: boolean;
          push_to_talk_enabled?: boolean;
          push_to_talk_key?: string | null;
          input_volume?: number;
          output_volume?: number;
          allow_direct_messages?: 'everyone' | 'friends' | 'none';
          allow_friend_requests?: 'everyone' | 'friends_of_friends' | 'none';
          email_notifications?: boolean;
          desktop_notifications?: boolean;
          updated_at?: string;
        };
      };
      conversations: {
        Row: {
          id: string;
          type: 'direct' | 'group';
          name: string | null;
          icon_url: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          type?: 'direct' | 'group';
          name?: string | null;
          icon_url?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          type?: 'direct' | 'group';
          name?: string | null;
          icon_url?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      conversation_members: {
        Row: {
          id: string;
          conversation_id: string;
          user_id: string;
          role: 'owner' | 'admin' | 'member';
          last_read_at: string | null;
          joined_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          user_id: string;
          role?: 'owner' | 'admin' | 'member';
          last_read_at?: string | null;
          joined_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          user_id?: string;
          role?: 'owner' | 'admin' | 'member';
          last_read_at?: string | null;
          joined_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          reply_to_id: string | null;
          is_pinned: boolean;
          is_edited: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          reply_to_id?: string | null;
          is_pinned?: boolean;
          is_edited?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          sender_id?: string;
          content?: string;
          reply_to_id?: string | null;
          is_pinned?: boolean;
          is_edited?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      message_attachments: {
        Row: {
          id: string;
          message_id: string;
          conversation_id: string;
          file_name: string;
          file_type: string;
          file_size: number;
          storage_path: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          conversation_id: string;
          file_name: string;
          file_type: string;
          file_size: number;
          storage_path: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          conversation_id?: string;
          file_name?: string;
          file_type?: string;
          file_size?: number;
          storage_path?: string;
          created_at?: string;
        };
      };
      message_reactions: {
        Row: {
          id: string;
          message_id: string;
          user_id: string;
          emoji: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          user_id: string;
          emoji: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          user_id?: string;
          emoji?: string;
          created_at?: string;
        };
      };
      servers: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          icon_url: string | null;
          owner_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          icon_url?: string | null;
          owner_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          icon_url?: string | null;
          owner_id?: string | null;
          created_at?: string;
        };
      };
      server_members: {
        Row: {
          id: string;
          server_id: string;
          user_id: string;
          role: 'owner' | 'admin' | 'moderator' | 'member';
          joined_at: string;
        };
        Insert: {
          id?: string;
          server_id: string;
          user_id: string;
          role?: 'owner' | 'admin' | 'moderator' | 'member';
          joined_at?: string;
        };
        Update: {
          id?: string;
          server_id?: string;
          user_id?: string;
          role?: 'owner' | 'admin' | 'moderator' | 'member';
          joined_at?: string;
        };
      };
      channels: {
        Row: {
          id: string;
          server_id: string;
          name: string;
          type: 'text' | 'voice';
          topic: string | null;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          server_id: string;
          name: string;
          type?: 'text' | 'voice';
          topic?: string | null;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          server_id?: string;
          name?: string;
          type?: 'text' | 'voice';
          topic?: string | null;
          position?: number;
          created_at?: string;
        };
      };
      channel_messages: {
        Row: {
          id: string;
          channel_id: string;
          user_id: string;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          channel_id: string;
          user_id: string;
          content: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          channel_id?: string;
          user_id?: string;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      friend_requests: {
        Row: {
          id: string;
          sender_id: string;
          receiver_id: string;
          status: 'pending' | 'accepted' | 'declined';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sender_id: string;
          receiver_id: string;
          status?: 'pending' | 'accepted' | 'declined';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          sender_id?: string;
          receiver_id?: string;
          status?: 'pending' | 'accepted' | 'declined';
          created_at?: string;
          updated_at?: string;
        };
      };
      friendships: {
        Row: {
          id: string;
          user_id: string;
          friend_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          friend_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          friend_id?: string;
          created_at?: string;
        };
      };
      blocks: {
        Row: {
          id: string;
          blocker_id: string;
          blocked_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          blocker_id: string;
          blocked_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          blocker_id?: string;
          blocked_id?: string;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_or_get_direct_conversation: {
        Args: {
          target_user_id: string;
        };
        Returns: string;
      };
      accept_friend_request: {
        Args: {
          request_id: string;
        };
        Returns: Json;
      };
    };
  };
}
