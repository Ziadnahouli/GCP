export type UserStatus = 'online' | 'idle' | 'dnd' | 'offline';

export type AccentTheme = 'violet' | 'cyan' | 'emerald' | 'crimson' | 'amber';

export type VisibilityAudience = 'everyone' | 'friends' | 'mutual_servers' | 'nobody';

export interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_path?: string | null;
  avatar_color?: string | null;
  banner_url: string | null;
  banner_path?: string | null;
  banner_color: string | null;
  accent_color?: string | null;
  profile_theme?: { primary: string; accent: string } | null;
  decoration_id?: string | null;
  bio: string | null;
  pronouns?: string | null;
  custom_status: string | null;
  custom_status_emoji?: string | null;
  custom_status_expires_at?: string | null;
  timezone?: string | null;
  status: UserStatus;
  game_activity: string | null;
  favorite_games?: string[];
  activity_text?: string | null;
  activity_expires_at?: string | null;
  voice_intro_path?: string | null;
  username_changed_at?: string | null;
  avatar_updated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type Profile = UserProfile;

export interface PublicProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_path: string | null;
  avatar_color: string | null;
  decoration_id: string | null;
  status: UserStatus;
  custom_status: string | null;
  custom_status_emoji: string | null;
}

export interface ProfileLinkItem {
  id: string;
  user_id: string;
  label: string;
  url: string;
  position: number;
  created_at?: string;
}

export interface UserBadgeItem {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  category: string;
  granted_at?: string;
}

export interface ProfileCardData {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_path: string | null;
  avatar_color: string | null;
  banner_url: string | null;
  banner_path: string | null;
  banner_color: string | null;
  accent_color: string | null;
  profile_theme: { primary: string; accent: string } | null;
  decoration_id: string | null;
  bio: string | null;
  pronouns: string | null;
  timezone: string | null;
  status: UserStatus;
  custom_status: string | null;
  custom_status_emoji: string | null;
  activity_text: string | null;
  favorite_games: string[];
  created_at: string;
  server_nickname: string | null;
  server_avatar_path: string | null;
  server_banner_path: string | null;
  server_bio: string | null;
  server_pronouns: string | null;
  server_role: string | null;
  server_joined_at: string | null;
  effective_display_name: string;
  effective_avatar_path: string | null;
  effective_banner_path: string | null;
  effective_bio: string | null;
  effective_pronouns: string | null;
  is_friend: boolean;
  is_blocked: boolean;
  is_self: boolean;
  mutual_servers_count: number;
  mutual_friends_count: number;
  badges?: UserBadgeItem[];
  links?: ProfileLinkItem[];
}

export interface ServerMemberProfile {
  nickname: string | null;
  avatar_path: string | null;
  banner_path: string | null;
  bio: string | null;
  pronouns: string | null;
}

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
  input_device_id?: string | null;
  output_device_id?: string | null;
  allow_direct_messages: 'everyone' | 'friends' | 'none';
  allow_friend_requests: 'everyone' | 'friends_of_friends' | 'none';
  profile_visibility?: VisibilityAudience;
  presence_visibility?: VisibilityAudience;
  activity_visibility?: VisibilityAudience;
  local_time_visibility?: VisibilityAudience;
  badges_visibility?: VisibilityAudience;
  email_notifications: boolean;
  desktop_notifications: boolean;
  notif_dms?: boolean;
  notif_mentions?: boolean;
  notif_friend_requests?: boolean;
  notif_invites?: boolean;
  notif_missed_calls?: boolean;
  theme_mode?: 'system' | 'light' | 'dark' | null;
  density?: 'comfortable' | 'compact' | null;
  text_scale?: string | null;
  reduce_motion?: boolean | null;
  updated_at: string;
}
