'use client';

import '@/lib/webrtc/safe-constraints';
import * as React from 'react';
import { User } from '@supabase/supabase-js';
import { getBrowserClient } from '@/lib/supabase/client';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { AuthContextType } from '@/lib/types/auth';
import { UserProfile, UserSettings, UserStatus } from '@/lib/types/profile';
import { realtimeHub } from '@/lib/realtime/realtime-hub';
import { audioSessionCoordinator } from '@/lib/webrtc/audio-session-coordinator';

const AuthContext = React.createContext<AuthContextType | null>(null);

const DEFAULT_PROFILE: UserProfile = {
  id: 'local-user-id',
  username: 'gamer_one',
  display_name: 'Apex Striker',
  avatar_url: null,
  banner_url: null,
  banner_color: '#7c3aed',
  bio: 'Tactical gamer & squad leader. Ready for competitive matches.',
  custom_status: 'In Lobby • Ready up!',
  status: 'online',
  game_activity: 'Valorant',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const DEFAULT_SETTINGS: UserSettings = {
  id: 'default-settings',
  user_id: '',
  theme: 'dark',
  accent_color: 'violet',
  sound_effects_enabled: true,
  push_to_talk_enabled: false,
  push_to_talk_key: 'KeyV',
  input_volume: 85,
  output_volume: 100,
  allow_direct_messages: 'everyone',
  allow_friend_requests: 'everyone',
  email_notifications: true,
  desktop_notifications: true,
  notif_dms: true,
  notif_mentions: true,
  notif_friend_requests: true,
  notif_invites: true,
  notif_missed_calls: true,
  updated_at: new Date().toISOString(),
};

/**
 * A3: Comprehensive client state reset on sign-out and remote logout.
 * Cleans all application caches, localStorage tokens, realtime channels, and audio sessions.
 */
export function resetClientState(): void {
  if (typeof window !== 'undefined') {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith('nexus_') ||
            key.startsWith('sb-') ||
            key.includes('supabase'))
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {}
  }
  try {
    realtimeHub.clear();
  } catch {}
  try {
    audioSessionCoordinator.reset();
  } catch {}
}

export function getLocalDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  let id = localStorage.getItem('nexus_device_id');
  if (!id) {
    id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('nexus_device_id', id);
  }
  return id;
}

export function getDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Web Client';
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return 'iPhone • Safari';
  if (/iPad/i.test(ua)) return 'iPad • Safari';
  if (/Android/i.test(ua)) return 'Android Device';
  if (/Windows/i.test(ua)) return 'Windows PC • Browser';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac • Browser';
  if (/Linux/i.test(ua)) return 'Linux • Browser';
  return 'Desktop Client';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [settings, setSettings] = React.useState<UserSettings | null>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const config = React.useMemo(() => getSupabaseConfig(), []);
  const supabase = React.useMemo(() => getBrowserClient(), []);

  // A1: Fetch or sync profile & settings without overwriting on transient read error
  const fetchProfileAndSettings = React.useCallback(
    async (userId: string, currentUser?: User) => {
      try {
        const [profileRes, settingsRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
          supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
        ]);

        if (profileRes.error) {
          // A1: If transient read error occurred, DO NOT assume profile is missing and DO NOT clobber!
          console.error('[AuthProvider] Transient error fetching profile; skipping overwrite:', profileRes.error);
        } else if (profileRes.data) {
          setProfile(profileRes.data as UserProfile);
        } else {
          // Profile genuinely does not exist: call ensure_profile RPC to assign unique username with suffix
          const meta = currentUser?.user_metadata || {};
          const candidateUsername = meta.username || currentUser?.email?.split('@')[0] || `gamer_${userId.slice(0, 6)}`;
          const candidateDisplayName = meta.display_name || meta.username || candidateUsername;

          const { data: ensuredProfile, error: ensureErr } = await supabase.rpc('ensure_profile', {
            p_user_id: userId,
            p_email: currentUser?.email || null,
            p_username: candidateUsername,
            p_display_name: candidateDisplayName,
          });

          if (!ensureErr && ensuredProfile) {
            setProfile(ensuredProfile as UserProfile);
          } else {
            // Fallback to single insert with ON CONFLICT ignore if RPC not yet deployed
            const { data: fallbackProfile } = await supabase
              .from('profiles')
              .upsert(
                {
                  id: userId,
                  username: candidateUsername,
                  display_name: candidateDisplayName,
                  status: 'online',
                  banner_color: '#7c3aed',
                },
                { onConflict: 'id' }
              )
              .select()
              .maybeSingle();

            if (fallbackProfile) {
              setProfile(fallbackProfile as UserProfile);
            }
          }
        }

        if (settingsRes.error) {
          console.warn('[AuthProvider] Notice fetching user_settings:', settingsRes.error);
        } else if (settingsRes.data) {
          setSettings(settingsRes.data as UserSettings);
          document.documentElement.setAttribute('data-theme', settingsRes.data.accent_color);
        } else {
          const userDefaultSettings = { ...DEFAULT_SETTINGS, user_id: userId, id: `settings_${userId}` };
          setSettings(userDefaultSettings);
          supabase
            .from('user_settings')
            .upsert({ user_id: userId, theme: 'dark', accent_color: 'violet' }, { onConflict: 'user_id' })
            .then(() => {}, () => {});
        }
      } catch (err: unknown) {
        console.error('Error fetching profile/settings:', err);
      }
    },
    [supabase]
  );

  // Initialize session
  React.useEffect(() => {
    let mounted = true;

    // Helper to refresh session if expired or close to expiry (within 5 mins)
    const ensureValidSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.expires_at) {
          const expiresAtMs = session.expires_at * 1000;
          const timeLeftMs = expiresAtMs - Date.now();
          // If expired or less than 5 minutes remaining, refresh
          if (timeLeftMs < 300000) {
            await supabase.auth.refreshSession();
          }
        }
      } catch (e) {
        console.warn('Session refresh check notice:', e);
      }
    };

    async function init() {
      // Automatic detection of email recovery links landing on root with hash or query
      if (typeof window !== 'undefined') {
        const hash = window.location.hash || '';
        const search = window.location.search || '';
        if (hash.includes('type=recovery') || search.includes('type=recovery')) {
          if (window.location.pathname !== '/reset-password') {
            window.location.href = `/reset-password${search}${hash}`;
            return;
          }
        }
      }

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (session?.user) {
          setUser(session.user);
          await fetchProfileAndSettings(session.user.id, session.user);
        } else {
          setUser(null);
          setProfile(null);
        }
      } catch (err: unknown) {
        console.error('Auth initialization error:', err);
        setError('Failed to initialize session');
        if (mounted) {
          setUser(null);
          setProfile(null);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!mounted) return;

        // Auto-navigate to reset password form when Supabase triggers PASSWORD_RECOVERY
        if (_event === 'PASSWORD_RECOVERY') {
          if (typeof window !== 'undefined' && window.location.pathname !== '/reset-password') {
            window.location.href = '/reset-password';
            return;
          }
        }

        if (_event === 'SIGNED_OUT') {
          // A3: Reset client state on signed out event from this or other tabs
          resetClientState();
          setUser(null);
          setProfile(null);
          setSettings(null);
          setIsLoading(false);
          return;
        }

        if (session?.user) {
          setUser(session.user);
          // Decouple from Supabase auth internal lock: execute outside onAuthStateChange to prevent deadlock
          setTimeout(() => {
            if (mounted) {
              fetchProfileAndSettings(session.user.id, session.user);
            }
          }, 0);
        } else {
          setUser(null);
          setProfile(null);
        }
        setIsLoading(false);
      });

      // Proactive periodic keepalive every 3 minutes
      const keepaliveTimer = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        ensureValidSession();
      }, 180000);

      // Keepalive HTTP REST connection every 25 seconds to prevent proxy socket timeout
      const restKeepaliveTimer = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        supabase.from('profiles').select('id').limit(1).then(() => {}, () => {});
      }, 25000);

      // Revalidate/refresh immediately when tab becomes active or focused
      const handleResume = () => {
        if (typeof document !== 'undefined' && !document.hidden) {
          ensureValidSession();
        }
      };

      if (typeof window !== 'undefined') {
        window.addEventListener('focus', handleResume);
        document.addEventListener('visibilitychange', handleResume);
      }

      return () => {
        subscription.unsubscribe();
        clearInterval(keepaliveTimer);
        clearInterval(restKeepaliveTimer);
        if (typeof window !== 'undefined') {
          window.removeEventListener('focus', handleResume);
          document.removeEventListener('visibilitychange', handleResume);
        }
      };
    }

    const cleanupPromise = init();

    return () => {
      mounted = false;
      cleanupPromise.then((cleanup) => cleanup && cleanup());
    };
  }, [supabase, fetchProfileAndSettings]);

  // Multi-Device Tracking & Heartbeat
  React.useEffect(() => {
    if (!user || !supabase || !config.isConfigured) return;
    const deviceId = getLocalDeviceId();
    const deviceName = getDeviceName();

    const recordDevice = async () => {
      try {
        const { error: rpcErr } = await supabase.rpc('record_user_device', {
          p_device_id: deviceId,
          p_device_name: deviceName,
          p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        });
        if (!rpcErr) return;

        await supabase
          .from('user_devices')
          .upsert(
            {
              user_id: user.id,
              device_id: deviceId,
              device_name: deviceName,
              user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
              last_active_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,device_id' }
          );
      } catch {}
    };

    recordDevice();
    const interval = setInterval(recordDevice, 60000);
    return () => clearInterval(interval);
  }, [user?.id, supabase, config.isConfigured]);

  // Sign in with password (A2: Fail loudly in production if unconfigured)
  const signInWithPassword = React.useCallback(
    async (email: string, password: string) => {
      setError(null);
      if (!config.isConfigured) {
        const isProduction = process.env.NODE_ENV === 'production';
        const isExplicitDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
        if (isProduction && !isExplicitDemo) {
          const err = 'Authentication service is unconfigured in this production deployment.';
          setError(err);
          return { error: err };
        }
        // Local simulation demo mode
        const mockUser = {
          id: 'local-user-id',
          email,
          created_at: new Date().toISOString(),
        } as unknown as User;
        setUser(mockUser);
        const currentProfile = profile || {
          ...DEFAULT_PROFILE,
          display_name: email.split('@')[0],
        };
        setProfile(currentProfile);
        localStorage.setItem('nexus_local_profile', JSON.stringify(currentProfile));
        return { error: null };
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInErr) {
        return { error: signInErr.message };
      }
      return { error: null };
    },
    [config.isConfigured, supabase, profile]
  );

  // Sign up with password (A2: Fail loudly in production if unconfigured)
  const signUpWithPassword = React.useCallback(
    async ({
      email,
      password,
      username,
      display_name,
    }: {
      email: string;
      password: string;
      username: string;
      display_name: string;
    }) => {
      setError(null);
      if (!config.isConfigured) {
        const isProduction = process.env.NODE_ENV === 'production';
        const isExplicitDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
        if (isProduction && !isExplicitDemo) {
          const err = 'Registration service is unconfigured in this production deployment.';
          setError(err);
          return { error: err, emailConfirmationRequired: false };
        }
        // Local simulation demo mode
        const newProfile: UserProfile = {
          ...DEFAULT_PROFILE,
          username,
          display_name,
        };
        setProfile(newProfile);
        localStorage.setItem('nexus_local_profile', JSON.stringify(newProfile));
        return { error: null, emailConfirmationRequired: false };
      }

      const { data, error: signUpErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            display_name,
          },
        },
      });

      if (signUpErr) {
        return { error: signUpErr.message };
      }

      // Check if email confirmation is required
      const emailConfirmationRequired = !data.session;
      return { error: null, emailConfirmationRequired };
    },
    [config.isConfigured, supabase]
  );

  // Sign out (A3: Complete cleanup of caches, tokens, channels, and sessions)
  const signOut = React.useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Sign out error:', e);
    }
    resetClientState();
    setUser(null);
    setProfile(null);
    setSettings(null);
  }, [supabase]);

  // Update profile (A4: Optimistic update with reliable error rollback)
  const updateProfile = React.useCallback(
    async (updates: Partial<UserProfile>) => {
      const prevProfile = profile;
      const nextProfile = { ...(profile || DEFAULT_PROFILE), ...updates, updated_at: new Date().toISOString() };
      setProfile(nextProfile);

      if (!config.isConfigured || !user) {
        try {
          localStorage.setItem('nexus_local_profile', JSON.stringify(nextProfile));
        } catch {}
        return { error: null };
      }

      try {
        const { data: updatedProfile, error: updateErr } = await supabase
          .from('profiles')
          .update({
            ...updates,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id)
          .select()
          .maybeSingle();

        if (updateErr) {
          console.warn('Profile database update warning:', updateErr);
          // A4: Roll back optimistic state on failure
          setProfile(prevProfile);
          return { error: updateErr.message };
        }

        if (updatedProfile) {
          setProfile(updatedProfile as UserProfile);
        }

        // Broadcast to social-realtime so all peers see status/presence change instantly
        try {
          const channels = supabase.getChannels ? supabase.getChannels() : [];
          const socialChannel = channels.find((c: any) => c.topic === 'realtime:social-realtime') || supabase.channel('social-realtime');
          if (socialChannel.state === 'joined') {
            socialChannel
              .send({
                type: 'broadcast',
                event: 'social_update',
                payload: { userId: user.id, updates },
              })
              .catch(() => {});
          } else if (typeof (socialChannel as any).httpSend === 'function') {
            (socialChannel as any)
              .httpSend({
                type: 'broadcast',
                event: 'social_update',
                payload: { userId: user.id, updates },
              })
              .catch(() => {});
          }
        } catch {}

        return { error: null };
      } catch (err: unknown) {
        setProfile(prevProfile);
        return { error: err instanceof Error ? err.message : 'Failed to update profile' };
      }
    },
    [config.isConfigured, profile, supabase, user]
  );

  // Update settings (A4: Upsert on missing row, with DOM theme and state rollback on failure)
  const updateSettings = React.useCallback(
    async (updates: Partial<UserSettings>) => {
      const prevSettings = settings;
      const prevTheme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;

      if (updates.accent_color && typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', updates.accent_color);
      }

      if (!config.isConfigured) {
        const updated = { ...(settings || DEFAULT_SETTINGS), ...updates, updated_at: new Date().toISOString() };
        setSettings(updated);
        try {
          localStorage.setItem('nexus_local_settings', JSON.stringify(updated));
        } catch {}
        return { error: null };
      }

      if (!user) return { error: 'Not authenticated' };

      const { data: upsertedSettings, error: updateErr } = await supabase
        .from('user_settings')
        .upsert(
          {
            user_id: user.id,
            ...updates,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
        .select()
        .maybeSingle();

      if (updateErr) {
        // A4: Revert DOM theme and state on failure
        if (prevTheme && typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-theme', prevTheme);
        }
        setSettings(prevSettings);
        return { error: updateErr.message };
      }

      setSettings((prev) => (upsertedSettings ? (upsertedSettings as UserSettings) : prev ? { ...prev, ...updates } : null));
      return { error: null };
    },
    [config.isConfigured, settings, supabase, user]
  );

  const refreshProfile = React.useCallback(async () => {
    if (user) {
      await fetchProfileAndSettings(user.id);
    }
  }, [user, fetchProfileAndSettings]);

  const authContextValue = React.useMemo(
    () => ({
      user,
      profile,
      settings,
      isLoading,
      isConfigured: config.isConfigured,
      error,
      signInWithPassword,
      signUpWithPassword,
      signOut,
      updateProfile,
      updateSettings,
      refreshProfile,
    }),
    [
      user,
      profile,
      settings,
      isLoading,
      config.isConfigured,
      error,
      signInWithPassword,
      signUpWithPassword,
      signOut,
      updateProfile,
      updateSettings,
      refreshProfile,
    ]
  );

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useOptionalAuth() {
  return React.useContext(AuthContext);
}
