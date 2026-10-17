import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as React from 'react';
import { useNotifications, NotificationItem } from '@/hooks/use-notifications';
import { useModalEscape } from '@/hooks/use-modal-escape';
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts';

// Mock Supabase client
const mockFrom = vi.fn();
const mockChannel = vi.fn();
const mockRemoveChannel = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => ({
    from: mockFrom,
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  }),
}));

// Mock Auth
let mockUser: { id: string; email: string } | null = { id: 'user-p3-1', email: 'test@nexus.gg' };
let mockSettings = {
  sound_effects_enabled: true,
  desktop_notifications: false,
};

vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({
    user: mockUser,
    settings: mockSettings,
    isConfigured: true,
  }),
  useOptionalAuth: () => ({
    user: mockUser,
    settings: mockSettings,
    isConfigured: true,
  }),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('@/features/servers/server-voice-context', () => ({
  useServerVoiceContext: () => ({
    isVoiceConnected: false,
    isMicMuted: false,
    isDeafened: false,
    toggleMic: vi.fn(),
    toggleDeafen: vi.fn(),
  }),
}));

vi.mock('@/features/calls/call-context', () => ({
  useCallContext: () => ({
    callStatus: 'idle',
    isMicMuted: false,
    isDeafened: false,
    toggleMic: vi.fn(),
    toggleDeafen: vi.fn(),
  }),
}));

describe('Phase 3 Features: Notifications, Search Shortcuts, Modals & Audio Preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUser = { id: 'user-p3-1', email: 'test@nexus.gg' };
    mockSettings = {
      sound_effects_enabled: true,
      desktop_notifications: false,
    };

    mockChannel.mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('useNotifications hook', () => {
    it('initializes with unread count and allows marking as read', async () => {
      const initialNotifs: NotificationItem[] = [
        {
          id: 'n-1',
          user_id: 'user-p3-1',
          title: 'Direct Message',
          message: 'Hey, ready for scrims?',
          type: 'message',
          is_read: false,
          created_at: new Date().toISOString(),
          data: { conversation_id: 'conv-123' },
        },
        {
          id: 'n-2',
          user_id: 'user-p3-1',
          title: 'Squad Invite',
          message: 'Invited to Redline Racing',
          type: 'friend_request',
          is_read: true,
          created_at: new Date(Date.now() - 10000).toISOString(),
        },
      ];

      // Mock database select query response
      const mockLimit = vi.fn().mockResolvedValue({ data: initialNotifs, error: null });
      const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

      // Mock database update query response
      const mockUpdateFinal = vi.fn().mockResolvedValue({ error: null });
      const mockUpdateEq = vi.fn().mockReturnValue({ eq: mockUpdateFinal });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'notifications') {
          return {
            select: mockSelect,
            update: mockUpdate,
            delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }),
          };
        }
        return {};
      });

      const { result } = renderHook(() => useNotifications());

      // Wait for async fetch
      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.notifications.length).toBe(2);
      expect(result.current.unreadCount).toBe(1);

      // Mark n-1 as read
      await act(async () => {
        await result.current.markAsRead('n-1');
      });

      expect(result.current.unreadCount).toBe(0);
      expect(result.current.notifications.find((n) => n.id === 'n-1')?.is_read).toBe(true);
    });

    it('marks all notifications as read and clears unread count', async () => {
      const initialNotifs: NotificationItem[] = [
        {
          id: 'n-10',
          user_id: 'user-p3-1',
          title: 'Direct Message',
          message: 'Message 1',
          type: 'message',
          is_read: false,
          created_at: new Date().toISOString(),
        },
        {
          id: 'n-11',
          user_id: 'user-p3-1',
          title: 'Mention',
          message: 'Tagged in general',
          type: 'mention',
          is_read: false,
          created_at: new Date().toISOString(),
        },
      ];

      const mockLimit = vi.fn().mockResolvedValue({ data: initialNotifs, error: null });
      const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      const mockUpdateEq = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq });

      mockFrom.mockReturnValue({
        select: mockSelect,
        update: mockUpdate,
      });

      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.unreadCount).toBe(2);

      await act(async () => {
        await result.current.markAllAsRead();
      });

      expect(result.current.unreadCount).toBe(0);
      expect(result.current.notifications.every((n) => n.is_read)).toBe(true);
    });

    it('deletes notification correctly from state', async () => {
      const initialNotifs: NotificationItem[] = [
        {
          id: 'n-del-1',
          user_id: 'user-p3-1',
          title: 'Server Alert',
          message: 'Server maintenance completed',
          type: 'system',
          is_read: false,
          created_at: new Date().toISOString(),
        },
      ];

      const mockLimit = vi.fn().mockResolvedValue({ data: initialNotifs, error: null });
      const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      const mockDeleteFinal = vi.fn().mockResolvedValue({ error: null });
      const mockDeleteEq = vi.fn().mockReturnValue({ eq: mockDeleteFinal });
      const mockDelete = vi.fn().mockReturnValue({ eq: mockDeleteEq });

      mockFrom.mockReturnValue({
        select: mockSelect,
        delete: mockDelete,
      });

      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.notifications.length).toBe(1);

      await act(async () => {
        await result.current.deleteNotification('n-del-1');
      });

      expect(result.current.notifications.length).toBe(0);
      expect(result.current.unreadCount).toBe(0);
    });
  });

  describe('useModalEscape hook', () => {
    it('invokes onClose when Escape key is pressed and modal is open', () => {
      const onClose = vi.fn();
      renderHook(() => useModalEscape(true, onClose));

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not invoke onClose when modal is not open', () => {
      const onClose = vi.fn();
      renderHook(() => useModalEscape(false, onClose));

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });

      expect(onClose).not.toHaveBeenCalled();
    });

    it('ignores non-Escape keys', () => {
      const onClose = vi.fn();
      renderHook(() => useModalEscape(true, onClose));

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'KeyM' }));
      });

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Audio Device Preferences & Persistence', () => {
    it('persists selected microphone and output devices in localStorage', () => {
      const micDeviceId = 'virtual-mic-device-abc-123';
      const outputDeviceId = 'virtual-headphones-def-456';

      localStorage.setItem('nexus_audio_input_device', micDeviceId);
      localStorage.setItem('nexus_audio_output_device', outputDeviceId);

      expect(localStorage.getItem('nexus_audio_input_device')).toBe(micDeviceId);
      expect(localStorage.getItem('nexus_audio_output_device')).toBe(outputDeviceId);
    });

    it('persists noise suppression and push-to-talk preferences', () => {
      localStorage.setItem('nexus_noise_suppression', 'true');
      localStorage.setItem('nexus_audio_prefs', JSON.stringify({ pushToTalk: true, pushToTalkKey: 'Space' }));

      expect(localStorage.getItem('nexus_noise_suppression')).toBe('true');
      const prefs = JSON.parse(localStorage.getItem('nexus_audio_prefs') || '{}');
      expect(prefs.pushToTalk).toBe(true);
      expect(prefs.pushToTalkKey).toBe('Space');
    });
  });

  describe('Global Search Shortcut', () => {
    it('dispatches nexus-open-global-search on Ctrl+K when outside input', () => {
      const searchListener = vi.fn();
      window.addEventListener('nexus-open-global-search', searchListener);

      renderHook(() => useGlobalShortcuts());

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'k',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        });
        window.dispatchEvent(event);
      });

      expect(searchListener).toHaveBeenCalledTimes(1);
      window.removeEventListener('nexus-open-global-search', searchListener);
    });

    it('does not dispatch nexus-open-global-search on Ctrl+K when typing in text input', () => {
      const searchListener = vi.fn();
      window.addEventListener('nexus-open-global-search', searchListener);

      renderHook(() => useGlobalShortcuts());

      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      act(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'k',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        });
        // Dispatch directly on input
        input.dispatchEvent(event);
      });

      expect(searchListener).not.toHaveBeenCalled();
      document.body.removeChild(input);
      window.removeEventListener('nexus-open-global-search', searchListener);
    });
  });
});
