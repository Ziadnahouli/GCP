export type UserStatus = 'online' | 'idle' | 'dnd' | 'offline';

export type AccentTheme = 'violet' | 'cyan' | 'emerald' | 'crimson' | 'amber';

export interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  banner_color: string | null;
  bio: string | null;
  custom_status: string | null;
  status: UserStatus;
  game_activity: string | null;
  created_at: string;
  updated_at: string;
}

export type Profile = UserProfile;

export interface UserSettings {
  id: string;
  user_id: string;
  theme: 'dark' | 'light' | 'system';
  accent_color: AccentTheme;
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
}
