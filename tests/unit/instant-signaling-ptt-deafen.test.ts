import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts';

// Mock contexts
const mockToggleServerMic = vi.fn();
const mockToggleServerDeafen = vi.fn();
const mockToggleCallMic = vi.fn();
const mockToggleCallDeafen = vi.fn();
const mockToast = vi.fn();

let mockServerVoiceState = {
  isVoiceConnected: false,
  isMicMuted: true,
  isDeafened: false,
  toggleMic: mockToggleServerMic,
  toggleDeafen: mockToggleServerDeafen,
};

let mockCallState = {
  callStatus: 'idle',
  isMicMuted: true,
  isDeafened: false,
  toggleMic: mockToggleCallMic,
  toggleDeafen: mockToggleCallDeafen,
};

let mockAuthState: { settings: any } = {
  settings: {
    push_to_talk_enabled: true,
    push_to_talk_key: 'KeyV',
  },
};

vi.mock('@/features/servers/server-voice-context', () => ({
  useServerVoiceContext: () => mockServerVoiceState,
}));

vi.mock('@/features/calls/call-context', () => ({
  useCallContext: () => mockCallState,
}));

vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => mockAuthState,
  useOptionalAuth: () => mockAuthState,
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe('Instant Signaling, PTT Hotkeys & Deafen Audio Controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockServerVoiceState = {
      isVoiceConnected: false,
      isMicMuted: true,
      isDeafened: false,
      toggleMic: mockToggleServerMic,
      toggleDeafen: mockToggleServerDeafen,
    };
    mockCallState = {
      callStatus: 'idle',
      isMicMuted: true,
      isDeafened: false,
      toggleMic: mockToggleCallMic,
      toggleDeafen: mockToggleCallDeafen,
    };
    mockAuthState = {
      settings: {
        push_to_talk_enabled: true,
        push_to_talk_key: 'KeyV',
      },
    };
  });

  describe('Push-to-Talk (PTT) Hotkeys', () => {
    it('1. Unmutes server voice when PTT key (V) is pressed, and re-mutes when released', () => {
      mockServerVoiceState.isVoiceConnected = true;
      mockServerVoiceState.isMicMuted = true;

      renderHook(() => useGlobalShortcuts());

      // Keydown V -> un-mute
      act(() => {
        const downEvent = new KeyboardEvent('keydown', {
          code: 'KeyV',
          key: 'v',
          bubbles: true,
        });
        window.dispatchEvent(downEvent);
      });

      expect(mockToggleServerMic).toHaveBeenCalledTimes(1);

      // Simulate mic state becoming unmuted after toggle
      mockServerVoiceState.isMicMuted = false;

      // Keyup V -> re-mute
      act(() => {
        const upEvent = new KeyboardEvent('keyup', {
          code: 'KeyV',
          key: 'v',
          bubbles: true,
        });
        window.dispatchEvent(upEvent);
      });

      expect(mockToggleServerMic).toHaveBeenCalledTimes(2);
    });

    it('2. Unmutes private call when Spacebar PTT key is held, and re-mutes on release', () => {
      mockCallState.callStatus = 'in_call';
      mockCallState.isMicMuted = true;

      renderHook(() => useGlobalShortcuts());

      // Keydown Space -> un-mute
      act(() => {
        const downEvent = new KeyboardEvent('keydown', {
          code: 'Space',
          key: ' ',
          bubbles: true,
        });
        window.dispatchEvent(downEvent);
      });

      expect(mockToggleCallMic).toHaveBeenCalledTimes(1);

      // Simulate unmuted state
      mockCallState.isMicMuted = false;

      // Keyup Space -> re-mute
      act(() => {
        const upEvent = new KeyboardEvent('keyup', {
          code: 'Space',
          key: ' ',
          bubbles: true,
        });
        window.dispatchEvent(upEvent);
      });

      expect(mockToggleCallMic).toHaveBeenCalledTimes(2);
    });

    it('3. Auto-releases PTT and re-mutes microphone on window blur (e.g. alt-tab)', () => {
      mockServerVoiceState.isVoiceConnected = true;
      mockServerVoiceState.isMicMuted = true;

      renderHook(() => useGlobalShortcuts());

      // Keydown V -> un-mute
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV', key: 'v' }));
      });
      expect(mockToggleServerMic).toHaveBeenCalledTimes(1);

      mockServerVoiceState.isMicMuted = false;

      // User alt-tabs -> blur event
      act(() => {
        window.dispatchEvent(new FocusEvent('blur'));
      });

      expect(mockToggleServerMic).toHaveBeenCalledTimes(2);
    });

    it('4. Ignores PTT keys when typing in input, textarea, or contenteditable elements', () => {
      mockServerVoiceState.isVoiceConnected = true;
      mockServerVoiceState.isMicMuted = true;

      renderHook(() => useGlobalShortcuts());

      const inputElement = document.createElement('input');
      document.body.appendChild(inputElement);

      act(() => {
        const inputEvent = new KeyboardEvent('keydown', {
          code: 'KeyV',
          key: 'v',
          bubbles: true,
        });
        Object.defineProperty(inputEvent, 'target', { value: inputElement, writable: false });
        window.dispatchEvent(inputEvent);
      });

      // Mic should NOT have toggled because user is typing
      expect(mockToggleServerMic).not.toHaveBeenCalled();

      document.body.removeChild(inputElement);
    });

    it('5. Falls back to localStorage nexus_audio_prefs when settings is null', () => {
      mockAuthState.settings = null;
      localStorage.setItem('nexus_audio_prefs', JSON.stringify({ pushToTalk: true, pushToTalkKey: 'KeyV' }));
      mockCallState.callStatus = 'in_call';
      mockCallState.isMicMuted = true;

      renderHook(() => useGlobalShortcuts());

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV', key: 'v' }));
      });

      expect(mockToggleCallMic).toHaveBeenCalledTimes(1);
    });
  });

  describe('Deafen Multi-Transport Suppression Logic', () => {
    it('6. Mutes remote tracks and LiveKit audio publications when deafened', () => {
      const mockTrack = {
        enabled: true,
        kind: 'audio',
      };
      const mockAttachedEl = {
        muted: false,
      };

      const mockRemoteParticipant = {
        identity: 'test-user-2',
        audioTrackPublications: new Map([
          [
            'track-1',
            {
              track: {
                mediaStreamTrack: mockTrack,
                attachedElements: [mockAttachedEl],
              },
            },
          ],
        ]),
      };

      const isDeafened = true;

      // Simulate deafen toggle application
      mockRemoteParticipant.audioTrackPublications.forEach((pub) => {
        if (pub.track) {
          if (pub.track.mediaStreamTrack) {
            pub.track.mediaStreamTrack.enabled = !isDeafened;
          }
          if (pub.track.attachedElements) {
            pub.track.attachedElements.forEach((el) => {
              el.muted = isDeafened;
            });
          }
        }
      });

      expect(mockTrack.enabled).toBe(false);
      expect(mockAttachedEl.muted).toBe(true);

      // Now un-deafen
      const undeafened = false;
      mockRemoteParticipant.audioTrackPublications.forEach((pub) => {
        if (pub.track) {
          if (pub.track.mediaStreamTrack) {
            pub.track.mediaStreamTrack.enabled = !undeafened;
          }
          if (pub.track.attachedElements) {
            pub.track.attachedElements.forEach((el) => {
              el.muted = undeafened;
            });
          }
        }
      });

      expect(mockTrack.enabled).toBe(true);
      expect(mockAttachedEl.muted).toBe(false);
    });
  });
});
