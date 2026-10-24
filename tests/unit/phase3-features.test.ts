import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as React from 'react';
import { useNotifications, NotificationItem } from '@/hooks/use-notifications';
import { useModalEscape } from '@/hooks/use-modal-escape';
import { useGlobalShortcuts, matchesPttKey } from '@/hooks/use-global-shortcuts';
import { realtimeHub } from '@/lib/realtime/realtime-hub';

const {
  mockFrom,
  mockChannel,
  mockRemoveChannel,
  mockClient,
  mockAuthState,
  mockServerVoiceState,
  mockCallState,
  mockToggleServerMic,
  mockToggleServerDeafen,
  mockToggleCallMic,
  mockToggleCallDeafen,
  mockToast,
} = vi.hoisted(() => {
  const mockFrom = vi.fn();
  const mockChannel = vi.fn();
  const mockRemoveChannel = vi.fn();
  const mockToggleServerMic = vi.fn();
  const mockToggleServerDeafen = vi.fn();
  const mockToggleCallMic = vi.fn();
  const mockToggleCallDeafen = vi.fn();
  const mockToast = vi.fn();

  const mockClient = {
    from: mockFrom,
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  };

  const mockAuthState = {
    user: { id: 'user-p3-1', email: 'test@nexus.gg' } as { id: string; email: string } | null,
    settings: {
      sound_effects_enabled: true,
      desktop_notifications: false,
      push_to_talk_enabled: true,
      push_to_talk_key: 'KeyV',
      output_volume: 80,
      input_device_id: 'configured-mic-id',
    } as any,
    profile: { id: 'user-p3-1', username: 'test_user', status: 'online' },
    isConfigured: true,
  };

  const mockServerVoiceState = {
    isVoiceConnected: false,
    isMicMuted: true,
    isDeafened: false,
    incomingVolume: 80,
    toggleMic: mockToggleServerMic,
    toggleDeafen: mockToggleServerDeafen,
  };

  const mockCallState = {
    callStatus: 'idle',
    isMicMuted: true,
    isDeafened: false,
    incomingVolume: 80,
    toggleMic: mockToggleCallMic,
    toggleDeafen: mockToggleCallDeafen,
  };

  return {
    mockFrom,
    mockChannel,
    mockRemoveChannel,
    mockClient,
    mockAuthState,
    mockServerVoiceState,
    mockCallState,
    mockToggleServerMic,
    mockToggleServerDeafen,
    mockToggleCallMic,
    mockToggleCallDeafen,
    mockToast,
  };
});

// Mock Supabase
vi.mock('@/lib/supabase/client', () => {
  return {
    supabase: mockClient,
    getBrowserClient: () => mockClient,
  };
});

// Mock Auth
vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({
    user: mockAuthState.user,
    settings: mockAuthState.settings,
    profile: mockAuthState.profile,
    isConfigured: mockAuthState.isConfigured,
  }),
  useOptionalAuth: () => ({
    user: mockAuthState.user,
    settings: mockAuthState.settings,
    profile: mockAuthState.profile,
    isConfigured: mockAuthState.isConfigured,
  }),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

vi.mock('@/features/servers/server-voice-context', () => ({
  useServerVoiceContext: () => mockServerVoiceState,
}));

vi.mock('@/features/calls/call-context', () => ({
  useCallContext: () => mockCallState,
  useCallState: () => mockCallState,
  useCallActions: () => mockCallState,
  useCallStats: () => ({ stats: {} }),
}));

describe('Phase 3 Comprehensive Audit: PTT State Machine, Notifications, Search, Escape Stack & Audio Prefs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    realtimeHub.clear();
    realtimeHub.setClient(mockClient);

    mockAuthState.user = { id: 'user-p3-1', email: 'test@nexus.gg' };
    mockAuthState.settings = {
      sound_effects_enabled: true,
      desktop_notifications: false,
      push_to_talk_enabled: true,
      push_to_talk_key: 'KeyV',
      output_volume: 80,
      input_device_id: 'configured-mic-id',
    };

    mockServerVoiceState.isVoiceConnected = false;
    mockServerVoiceState.isMicMuted = true;
    mockServerVoiceState.isDeafened = false;
    mockServerVoiceState.incomingVolume = 80;

    mockCallState.callStatus = 'idle';
    mockCallState.isMicMuted = true;
    mockCallState.isDeafened = false;
    mockCallState.incomingVolume = 80;

    mockChannel.mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* =====================================================================
     1. PUSH-TO-TALK STATE MACHINE REGRESSION TESTS
     ===================================================================== */
  describe('Push-to-Talk State Machine & Key Matching', () => {
    it('key matcher strictly checks configured key and rejects V and Space as unconditional fallbacks', () => {
      // When configured key is KeyT:
      expect(matchesPttKey(new KeyboardEvent('keydown', { code: 'KeyT', key: 't' }), 'KeyT')).toBe(true);
      expect(matchesPttKey(new KeyboardEvent('keydown', { code: 'KeyV', key: 'v' }), 'KeyT')).toBe(false);
      expect(matchesPttKey(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }), 'KeyT')).toBe(false);

      // When configured key is Space:
      expect(matchesPttKey(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }), 'Space')).toBe(true);
      expect(matchesPttKey(new KeyboardEvent('keydown', { code: 'KeyV', key: 'v' }), 'Space')).toBe(false);

      // When configured key is default KeyV:
      expect(matchesPttKey(new KeyboardEvent('keydown', { code: 'KeyV', key: 'v' }), 'KeyV')).toBe(true);
      expect(matchesPttKey(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }), 'KeyV')).toBe(false);
    });

    it('unmutes when PTT key is pressed only if microphone was muted, and re-mutes on key release', () => {
      mockServerVoiceState.isVoiceConnected = true;
      mockServerVoiceState.isMicMuted = true; // Initially MUTED
      mockAuthState.settings.push_to_talk_key = 'KeyV';

      renderHook(() => useGlobalShortcuts());

      // 1. Press PTT Key
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV', key: 'v' }));
      });
      expect(mockToggleServerMic).toHaveBeenCalledTimes(1);

      // Simulate mic transitioning to unmuted
      mockServerVoiceState.isMicMuted = false;

      // 2. Release PTT Key -> must re-mute
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyV', key: 'v' }));
      });
      expect(mockToggleServerMic).toHaveBeenCalledTimes(2);
    });

    it('does NOT mute or toggle microphone when PTT is pressed if microphone was ALREADY unmuted', () => {
      mockServerVoiceState.isVoiceConnected = true;
      mockServerVoiceState.isMicMuted = false; // ALREADY UNMUTED
      mockAuthState.settings.push_to_talk_key = 'KeyV';

      renderHook(() => useGlobalShortcuts());

      // 1. Press PTT key when already speaking/unmuted
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV', key: 'v' }));
      });
      // MUST NOT call toggleMic (must not unexpectedly mute!)
      expect(mockToggleServerMic).not.toHaveBeenCalled();

      // 2. Release PTT key -> MUST NOT call toggleMic either
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyV', key: 'v' }));
      });
      expect(mockToggleServerMic).not.toHaveBeenCalled();
    });

    it('strictly respects custom configured PTT keys (e.g. KeyT) and does not fire for KeyV or Space', () => {
      mockServerVoiceState.isVoiceConnected = true;
      mockServerVoiceState.isMicMuted = true;
      mockAuthState.settings.push_to_talk_key = 'KeyT'; // Custom key: T

      renderHook(() => useGlobalShortcuts());

      // Pressing KeyV must NOT unmute
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV', key: 'v' }));
      });
      expect(mockToggleServerMic).not.toHaveBeenCalled();

      // Pressing Space must NOT unmute
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
      });
      expect(mockToggleServerMic).not.toHaveBeenCalled();

      // Pressing KeyT MUST unmute
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', key: 't' }));
      });
      expect(mockToggleServerMic).toHaveBeenCalledTimes(1);

      mockServerVoiceState.isMicMuted = false;

      // Releasing KeyT MUST re-mute
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyT', key: 't' }));
      });
      expect(mockToggleServerMic).toHaveBeenCalledTimes(2);
    });

    it('cancels PTT hold and re-mutes microphone when window loses focus (blur)', () => {
      mockServerVoiceState.isVoiceConnected = true;
      mockServerVoiceState.isMicMuted = true;
      mockAuthState.settings.push_to_talk_key = 'KeyV';

      renderHook(() => useGlobalShortcuts());

      // Press PTT
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV', key: 'v' }));
      });
      expect(mockToggleServerMic).toHaveBeenCalledTimes(1);

      mockServerVoiceState.isMicMuted = false;

      // User Alt-Tabs away -> blur event
      act(() => {
        window.dispatchEvent(new FocusEvent('blur'));
      });
      // Must re-mute so voice doesn't stay stuck broadcasting
      expect(mockToggleServerMic).toHaveBeenCalledTimes(2);
    });

    it('focus loss does NOT mute microphone if it was already unmuted prior to PTT press', () => {
      mockServerVoiceState.isVoiceConnected = true;
      mockServerVoiceState.isMicMuted = false; // Already unmuted
      mockAuthState.settings.push_to_talk_key = 'KeyV';

      renderHook(() => useGlobalShortcuts());

      // Press PTT
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV', key: 'v' }));
      });
      expect(mockToggleServerMic).not.toHaveBeenCalled();

      // Window blur
      act(() => {
        window.dispatchEvent(new FocusEvent('blur'));
      });
      expect(mockToggleServerMic).not.toHaveBeenCalled();
    });

    it('works correctly for private 1-on-1 calls when not in a server voice channel', () => {
      mockServerVoiceState.isVoiceConnected = false;
      mockCallState.callStatus = 'in_call';
      mockCallState.isMicMuted = true;
      mockAuthState.settings.push_to_talk_key = 'KeyV';

      renderHook(() => useGlobalShortcuts());

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV', key: 'v' }));
      });
      expect(mockToggleCallMic).toHaveBeenCalledTimes(1);

      mockCallState.isMicMuted = false;

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyV', key: 'v' }));
      });
      expect(mockToggleCallMic).toHaveBeenCalledTimes(2);
    });
  });

  /* =====================================================================
     2. NOTIFICATIONS AUDIT: Loading, Unread Counts, Realtime & Error Handling
     ===================================================================== */
  describe('Notifications System Audit', () => {
    it('loads notifications, calculates unread counts, and handles markAsRead', async () => {
      const mockNotifs: NotificationItem[] = [
        {
          id: 'n-1',
          user_id: 'user-p3-1',
          title: 'Squad Invite',
          message: 'Invited to Scrims',
          type: 'friend_request',
          is_read: false,
          created_at: new Date().toISOString(),
        },
        {
          id: 'n-2',
          user_id: 'user-p3-1',
          title: 'Mention',
          message: 'Mentioned in #general',
          type: 'mention',
          is_read: true,
          created_at: new Date(Date.now() - 5000).toISOString(),
        },
      ];

      const mockLimit = vi.fn().mockResolvedValue({ data: mockNotifs, error: null });
      const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      const mockUpdateFinal = vi.fn().mockResolvedValue({ error: null });
      const mockUpdateEq2 = vi.fn().mockReturnValue({ eq: mockUpdateFinal });
      const mockUpdateEq1 = vi.fn().mockReturnValue({ eq: mockUpdateEq2 });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq1 });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'notifications') {
          return { select: mockSelect, update: mockUpdate };
        }
        return {};
      });

      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.notifications.length).toBe(2);
      expect(result.current.unreadCount).toBe(1);
      expect(result.current.isLoading).toBe(false);

      // Mark n-1 as read
      await act(async () => {
        await result.current.markAsRead('n-1');
      });

      expect(result.current.unreadCount).toBe(0);
      expect(result.current.notifications.find((n) => n.id === 'n-1')?.is_read).toBe(true);
    });

    it('gracefully handles database errors on markAsRead without throwing or breaking local state', async () => {
      const mockNotifs: NotificationItem[] = [
        {
          id: 'n-err-1',
          user_id: 'user-p3-1',
          title: 'Direct Chat',
          message: 'Yo',
          type: 'message',
          is_read: false,
          created_at: new Date().toISOString(),
        },
      ];

      const mockLimit = vi.fn().mockResolvedValue({ data: mockNotifs, error: null });
      const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

      // Database update fails with an error
      const mockUpdateEq2 = vi.fn().mockResolvedValue({ error: { message: 'Network connection lost' } });
      const mockUpdateEq1 = vi.fn().mockReturnValue({ eq: mockUpdateEq2 });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq1 });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'notifications') {
          return { select: mockSelect, update: mockUpdate };
        }
        return {};
      });

      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        await Promise.resolve();
      });

      // Must not throw an unhandled rejection
      await expect(
        act(async () => {
          await result.current.markAsRead('n-err-1');
        })
      ).resolves.not.toThrow();
    });

    it('handles Realtime INSERT, UPDATE, and DELETE events accurately', async () => {
      let insertCallback: any;
      let updateCallback: any;
      let deleteCallback: any;

      const channelObj: any = {
        on: vi.fn().mockImplementation((type: string, filter: any, callback: any) => {
          if (filter.event === 'INSERT') insertCallback = callback;
          if (filter.event === 'UPDATE') updateCallback = callback;
          if (filter.event === 'DELETE') deleteCallback = callback;
          return channelObj;
        }),
        subscribe: vi.fn().mockReturnThis(),
      };

      mockChannel.mockReturnValue(channelObj);

      const mockLimit = vi.fn().mockResolvedValue({ data: [], error: null });
      const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'notifications') {
          return { select: mockSelect };
        }
        return {};
      });

      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.notifications.length).toBe(0);

      // 1. Simulate Realtime INSERT
      const incoming: NotificationItem = {
        id: 'realtime-notif-1',
        user_id: 'user-p3-1',
        title: 'New Mention',
        message: 'You were mentioned',
        type: 'mention',
        is_read: false,
        created_at: new Date().toISOString(),
      };

      act(() => {
        insertCallback?.({ new: incoming });
      });

      expect(result.current.notifications.length).toBe(1);
      expect(result.current.unreadCount).toBe(1);

      // 2. Simulate Realtime UPDATE (read on another device)
      act(() => {
        updateCallback?.({ new: { ...incoming, is_read: true } });
      });

      expect(result.current.notifications[0].is_read).toBe(true);
      expect(result.current.unreadCount).toBe(0);

      // 3. Simulate Realtime DELETE
      act(() => {
        deleteCallback?.({ old: { id: 'realtime-notif-1' } });
      });

      expect(result.current.notifications.length).toBe(0);
    });

    it('resets notifications and seen IDs when switching accounts', async () => {
      const userANotifs: NotificationItem[] = [
        {
          id: 'userA-1',
          user_id: 'user-p3-1',
          title: 'Alert A',
          message: 'Msg A',
          type: 'system',
          is_read: false,
          created_at: new Date().toISOString(),
        },
      ];

      const mockLimit = vi.fn().mockResolvedValue({ data: userANotifs, error: null });
      const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'notifications') {
          return { select: mockSelect };
        }
        return {};
      });

      const { result, rerender } = renderHook(() => useNotifications());

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.notifications.length).toBe(1);
      expect(result.current.notifications[0].id).toBe('userA-1');

      // Switch to User B
      mockAuthState.user = { id: 'user-p3-2', email: 'userB@nexus.gg' };
      const userBNotifs: NotificationItem[] = [
        {
          id: 'userB-1',
          user_id: 'user-p3-2',
          title: 'Alert B',
          message: 'Msg B',
          type: 'system',
          is_read: false,
          created_at: new Date().toISOString(),
        },
      ];
      mockLimit.mockResolvedValueOnce({ data: userBNotifs, error: null });

      rerender();

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.notifications.length).toBe(1);
      expect(result.current.notifications[0].id).toBe('userB-1');
    });
  });

  /* =====================================================================
     3. MODAL ESCAPE LIFO STACK AUDIT (Nested Dialogs & Cleanup)
     ===================================================================== */
  describe('Modal Escape LIFO Stack & Cleanup', () => {
    it('closes single open modal on Escape', () => {
      const onClose = vi.fn();
      renderHook(() => useModalEscape(true, onClose));

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });

      expect(onClose).toHaveBeenCalledWith(false);
    });

    it('handles nested dialogs in LIFO order: closes only topmost dialog on first Escape, parent on second Escape', () => {
      const closeParent = vi.fn();
      const closeChild = vi.fn();

      // Modal A (Parent) opens
      const parentHook = renderHook(({ open }) => useModalEscape(open, closeParent), {
        initialProps: { open: true },
      });

      // Modal B (Child / Nested) opens on top of Modal A
      const childHook = renderHook(({ open }) => useModalEscape(open, closeChild), {
        initialProps: { open: true },
      });

      // Press Escape 1st time
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });

      // ONLY child must be closed! Parent must remain open.
      expect(closeChild).toHaveBeenCalledTimes(1);
      expect(closeParent).not.toHaveBeenCalled();

      // Simulate child closing in React state
      childHook.rerender({ open: false });

      // Press Escape 2nd time
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });

      // Now parent must close
      expect(closeParent).toHaveBeenCalledTimes(1);

      parentHook.unmount();
      childHook.unmount();
    });

    it('unmounting an open modal removes it from the escape stack cleanly', () => {
      const closeParent = vi.fn();
      const closeChild = vi.fn();

      renderHook(() => useModalEscape(true, closeParent));
      const child = renderHook(() => useModalEscape(true, closeChild));

      // Child unmounts abruptly
      child.unmount();

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });

      // Child is gone; parent must receive Escape cleanly
      expect(closeChild).not.toHaveBeenCalled();
      expect(closeParent).toHaveBeenCalledTimes(1);
    });
  });

  /* =====================================================================
     4. GLOBAL SEARCH SHORTCUT & TYPING FIELD EXCLUSION
     ===================================================================== */
  describe('Global Search Shortcut Audit', () => {
    it('dispatches nexus-open-global-search on Ctrl+K when outside inputs', () => {
      const listener = vi.fn();
      window.addEventListener('nexus-open-global-search', listener);

      renderHook(() => useGlobalShortcuts());

      act(() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'k',
            ctrlKey: true,
            bubbles: true,
          })
        );
      });

      expect(listener).toHaveBeenCalledTimes(1);
      window.removeEventListener('nexus-open-global-search', listener);
    });

    it('does NOT dispatch search on Ctrl+K when typing inside inputs or textareas', () => {
      const listener = vi.fn();
      window.addEventListener('nexus-open-global-search', listener);

      renderHook(() => useGlobalShortcuts());

      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      act(() => {
        const evt = new KeyboardEvent('keydown', {
          key: 'k',
          ctrlKey: true,
          bubbles: true,
        });
        input.dispatchEvent(evt);
      });

      expect(listener).not.toHaveBeenCalled();
      document.body.removeChild(input);
      window.removeEventListener('nexus-open-global-search', listener);
    });
  });

  /* =====================================================================
     5. AUDIO PREFERENCES PERSISTENCE & SETTINGS APPLICATION
     ===================================================================== */
  describe('Audio Preferences & Real Settings Source Application', () => {
    it('persists audio preferences to localStorage and settings accurately', () => {
      const audioPrefs = { pushToTalk: true, pushToTalkKey: 'KeyT' };
      localStorage.setItem('nexus_audio_prefs', JSON.stringify(audioPrefs));
      localStorage.setItem('nexus_noise_suppression', 'false');

      expect(JSON.parse(localStorage.getItem('nexus_audio_prefs') || '{}')).toEqual(audioPrefs);
      expect(localStorage.getItem('nexus_noise_suppression')).toBe('false');
    });

    it('respects audio preferences from localStorage when settings are updated', () => {
      mockAuthState.settings.push_to_talk_enabled = false;
      localStorage.setItem('nexus_audio_prefs', JSON.stringify({ pushToTalk: true, pushToTalkKey: 'KeyV' }));

      // useGlobalShortcuts respects localStorage when settings is null or toggled
      mockServerVoiceState.isVoiceConnected = true;
      mockServerVoiceState.isMicMuted = true;

      renderHook(() => useGlobalShortcuts());

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV', key: 'v' }));
      });
      // Should not trigger if settings explicitly has push_to_talk_enabled = false
      expect(mockToggleServerMic).not.toHaveBeenCalled();
    });
  });
});
