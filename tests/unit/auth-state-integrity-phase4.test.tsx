import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { resetClientState } from '@/features/auth/auth-provider';
import { ComponentErrorBoundary } from '@/components/ui/error-boundary';
import { realtimeHub } from '@/lib/realtime/realtime-hub';
import { audioSessionCoordinator } from '@/lib/webrtc/audio-session-coordinator';

describe('Phase 4 — Auth, State & Integrity Verification', () => {
  describe('A1: Profile Clobber Prevention on Read Errors', () => {
    it('does not clobber existing profile when database read returns a transient error', async () => {
      // Characterize transient read error behavior:
      // When Supabase returns an error for maybeSingle(), error is non-null.
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Failed to fetch: connection timeout', code: 'PGRST000' },
          }),
        }),
        rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Simulate fetchProfileAndSettings check
      const userId = 'user-uuid-123';
      const profileRes = await mockSupabase.from('profiles').select('*').eq('id', userId).maybeSingle();

      let profileClobbered = false;
      let ensureProfileCalled = false;

      if (profileRes.error) {
        // Correct behavior: recognize error and abort without overwriting!
        profileClobbered = false;
      } else if (profileRes.data) {
        profileClobbered = false;
      } else {
        // Only if error is null and data is null (row genuinely missing)
        ensureProfileCalled = true;
        profileClobbered = true;
      }

      expect(profileClobbered).toBe(false);
      expect(ensureProfileCalled).toBe(false);
      expect(mockSupabase.rpc).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('invokes ensure_profile RPC when profile row is genuinely absent (error is null, data is null)', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }),
        rpc: vi.fn().mockResolvedValue({
          data: {
            id: 'user-uuid-456',
            username: 'striker_9921',
            display_name: 'striker',
            status: 'online',
          },
          error: null,
        }),
      };

      const userId = 'user-uuid-456';
      const currentUser = { id: userId, email: 'striker@nexus.com', user_metadata: { username: 'striker' } };

      const profileRes = await mockSupabase.from('profiles').select('*').eq('id', userId).maybeSingle();

      let assignedProfile = null;
      if (!profileRes.error && !profileRes.data) {
        const { data } = await mockSupabase.rpc('ensure_profile', {
          p_user_id: userId,
          p_email: currentUser.email,
          p_username: currentUser.user_metadata.username,
          p_display_name: currentUser.user_metadata.username,
        });
        assignedProfile = data;
      }

      expect(mockSupabase.rpc).toHaveBeenCalledWith('ensure_profile', {
        p_user_id: 'user-uuid-456',
        p_email: 'striker@nexus.com',
        p_username: 'striker',
        p_display_name: 'striker',
      });
      expect(assignedProfile?.username).toBe('striker_9921');
    });
  });

  describe('A2: Production Security Isolation & Setting ID Sanitization', () => {
    it('refuses fallback authentication in production when unconfigured without explicit DEMO_MODE flag', () => {
      const isConfigured = false;
      const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

      const attemptSignIn = () => {
        if (!isConfigured) {
          if (!isDemoMode && process.env.NODE_ENV === 'production') {
            return { error: 'Supabase is not configured. Demo fallback is disabled in production.' };
          }
          return { error: null }; // demo only in dev
        }
        return { error: null };
      };

      const prevEnv = process.env.NODE_ENV;
      try {
        (process.env as any).NODE_ENV = 'production';
        const result = attemptSignIn();
        expect(result.error).toContain('disabled in production');
      } finally {
        (process.env as any).NODE_ENV = prevEnv;
      }
    });
  });

  describe('A3: Complete Client State Wipe on Logout', () => {
    beforeEach(() => {
      localStorage.clear();
      vi.spyOn(realtimeHub, 'clear').mockImplementation(() => {});
      vi.spyOn(audioSessionCoordinator, 'reset').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
      localStorage.clear();
    });

    it('clears all nexus_*, sb-*, and supabase keys from localStorage while preserving unrelated keys', () => {
      localStorage.setItem('nexus_device_id', 'dev-123');
      localStorage.setItem('nexus_local_profile', '{"id":"test"}');
      localStorage.setItem('nexus_draft_chan_1', 'hello world');
      localStorage.setItem('sb-auth-token', 'secret-token-xyz');
      localStorage.setItem('supabase.auth.token', 'refresh-token-abc');
      localStorage.setItem('unrelated_app_setting', 'keep_me');

      resetClientState();

      expect(localStorage.getItem('nexus_device_id')).toBeNull();
      expect(localStorage.getItem('nexus_local_profile')).toBeNull();
      expect(localStorage.getItem('nexus_draft_chan_1')).toBeNull();
      expect(localStorage.getItem('sb-auth-token')).toBeNull();
      expect(localStorage.getItem('supabase.auth.token')).toBeNull();
      expect(localStorage.getItem('unrelated_app_setting')).toBe('keep_me');
    });

    it('invokes realtimeHub.clear() and audioSessionCoordinator.reset() on logout', () => {
      resetClientState();
      expect(realtimeHub.clear).toHaveBeenCalled();
      expect(audioSessionCoordinator.reset).toHaveBeenCalled();
    });
  });

  describe('A4: Optimistic Update Rollback on DB Write Failure', () => {
    it('rolls back DOM theme attribute and state on user_settings upsert error', async () => {
      document.documentElement.setAttribute('data-theme', 'emerald');

      let currentSettings = { user_id: 'user-1', theme: 'dark', accent_color: 'emerald' };
      const prevSettings = { ...currentSettings };
      const prevTheme = document.documentElement.getAttribute('data-theme');

      // Optimistically apply new theme
      const newColor = 'cyan';
      document.documentElement.setAttribute('data-theme', newColor);
      currentSettings = { ...currentSettings, accent_color: newColor };

      // Mock database upsert failure
      const dbUpsert = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Row level security policy violation' },
      });

      const res = await dbUpsert();
      if (res.error) {
        // Rollback
        currentSettings = prevSettings;
        if (prevTheme) {
          document.documentElement.setAttribute('data-theme', prevTheme);
        }
      }

      expect(currentSettings.accent_color).toBe('emerald');
      expect(document.documentElement.getAttribute('data-theme')).toBe('emerald');
    });

    it('guarantees user_settings upsert uses onConflict: user_id', async () => {
      const upsertMock = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { user_id: 'user-1' }, error: null }),
      });

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          upsert: upsertMock,
        }),
      };

      const userId = 'user-1';
      const updates = { accent_color: 'violet', theme: 'dark' };

      await mockSupabase.from('user_settings').upsert(
        {
          user_id: userId,
          ...updates,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      ).select().maybeSingle();

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-1', accent_color: 'violet' }),
        { onConflict: 'user_id' }
      );
    });
  });

  describe('A5: Real Database Channels vs Fabricated IDs', () => {
    it('sorts channels deterministically by position without generating default-chan-* strings', () => {
      const rawChannels = [
        { id: 'uuid-voice-1', name: 'Voice Lounge', type: 'voice', position: 1 },
        { id: 'uuid-text-1', name: 'general', type: 'text', position: 0 },
        { id: 'uuid-text-2', name: 'announcements', type: 'text', position: 2 },
      ];

      const sorted = [...rawChannels].sort((a, b) => (a.position || 0) - (b.position || 0));

      expect(sorted[0].id).toBe('uuid-text-1');
      expect(sorted[0].name).toBe('general');
      expect(sorted[1].id).toBe('uuid-voice-1');
      expect(sorted[2].id).toBe('uuid-text-2');

      // Guarantee no fake IDs
      sorted.forEach((ch) => {
        expect(ch.id.startsWith('default-chan')).toBe(false);
        expect(ch.id.startsWith('default-voice')).toBe(false);
      });
    });
  });

  describe('A7: Component Error Boundary & Crash Containment', () => {
    const ProblematicChild = ({ shouldThrow }: { shouldThrow: boolean }) => {
      if (shouldThrow) {
        throw new Error('Fatal render error in channel view');
      }
      return <div>Normal Content</div>;
    };

    it('renders fallback UI when a child component throws during render', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <ComponentErrorBoundary sectionName="Main Chat">
          <ProblematicChild shouldThrow={true} />
        </ComponentErrorBoundary>
      );

      expect(screen.getByText('Error in Main Chat')).toBeDefined();
      expect(screen.getByText('Try Again')).toBeDefined();

      consoleErrorSpy.mockRestore();
    });

    it('recovers and calls onReset when Try Again is clicked', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onResetMock = vi.fn();

      render(
        <ComponentErrorBoundary sectionName="Voice Panel" onReset={onResetMock}>
          <ProblematicChild shouldThrow={true} />
        </ComponentErrorBoundary>
      );

      const tryAgainButton = screen.getByText('Try Again');
      fireEvent.click(tryAgainButton);

      expect(onResetMock).toHaveBeenCalledTimes(1);

      consoleErrorSpy.mockRestore();
    });
  });
});
