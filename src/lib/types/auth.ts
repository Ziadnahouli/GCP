import { User } from '@supabase/supabase-js';
import { UserProfile, UserSettings } from './profile';

export interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  settings: UserSettings | null;
  isLoading: boolean;
  isConfigured: boolean;
  error: string | null;
}

export interface AuthContextType extends AuthState {
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithPassword: (data: {
    email: string;
    password: string;
    username: string;
    display_name: string;
  }) => Promise<{ error: string | null; emailConfirmationRequired?: boolean }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ error: string | null }>;
  updateSettings: (updates: Partial<UserSettings>) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
}
