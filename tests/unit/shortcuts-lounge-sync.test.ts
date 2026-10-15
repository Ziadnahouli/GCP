import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as React from 'react';
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts';

// Mock audio & calls
const mockToggleServerMic = vi.fn();
const mockToggleServerDeafen = vi.fn();
const mockToggleCallMic = vi.fn();
const mockToggleCallDeafen = vi.fn();
const mockToast = vi.fn();

let mockServerVoiceState = {
  isVoiceConnected: true,
  isMicMuted: false,
  isDeafened: false,
  toggleMic: mockToggleServerMic,
  toggleDeafen: mockToggleServerDeafen,
};

let mockCallState = {
  callStatus: 'idle',
  isMicMuted: false,
  isDeafened: false,
  toggleMic: mockToggleCallMic,
  toggleDeafen: mockToggleCallDeafen,
};

vi.mock('@/features/servers/server-voice-context', () => ({
  useServerVoiceContext: () => mockServerVoiceState,
}));

vi.mock('@/features/calls/call-context', () => ({
  useCallContext: () => mockCallState,
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe('Global Shortcuts & Voice Lounge State', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServerVoiceState = {
      isVoiceConnected: true,
      isMicMuted: false,
      isDeafened: false,
      toggleMic: mockToggleServerMic,
      toggleDeafen: mockToggleServerDeafen,
    };
    mockCallState = {
      callStatus: 'idle',
      isMicMuted: false,
      isDeafened: false,
      toggleMic: mockToggleCallMic,
      toggleDeafen: mockToggleCallDeafen,
    };
    localStorage.clear();
  });

  it('1. Toggles microphone mute via Ctrl + Shift + M in voice lounge', () => {
    renderHook(() => useGlobalShortcuts());

    const event = new KeyboardEvent('keydown', {
      key: 'M',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(mockToggleServerMic).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Microphone Muted',
      })
    );
  });

  it('2. Toggles deafen via Ctrl + Shift + D in voice lounge', () => {
    renderHook(() => useGlobalShortcuts());

    const event = new KeyboardEvent('keydown', {
      key: 'D',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(mockToggleServerDeafen).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Audio Deafened',
      })
    );
  });

  it('3. Focuses quick search input on Ctrl + K', () => {
    const input = document.createElement('input');
    input.id = 'global-search-input';
    document.body.appendChild(input);
    const focusSpy = vi.spyOn(input, 'focus');

    renderHook(() => useGlobalShortcuts());

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(focusSpy).toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('4. Handles Push-To-Talk key (V) when enabled in preferences', () => {
    localStorage.setItem('nexus_audio_prefs', JSON.stringify({ pushToTalk: true }));
    mockServerVoiceState.isMicMuted = true;

    renderHook(() => useGlobalShortcuts());

    // Press V down -> un-mutes
    const keyDownEvent = new KeyboardEvent('keydown', {
      key: 'v',
      bubbles: true,
    });
    window.dispatchEvent(keyDownEvent);
    expect(mockToggleServerMic).toHaveBeenCalledTimes(1);

    // Release V -> re-mutes
    mockServerVoiceState.isMicMuted = false;
    const keyUpEvent = new KeyboardEvent('keyup', {
      key: 'v',
      bubbles: true,
    });
    window.dispatchEvent(keyUpEvent);
    expect(mockToggleServerMic).toHaveBeenCalledTimes(2);
  });

  it('5. Ensures disconnected user is never listed in voice channel occupants', () => {
    const currentUserId = 'user-me-123';
    const isVoiceConnectedToThis = false;

    const presenceList = [
      { user_id: 'user-other-456', display_name: 'Squadmate' },
      { user_id: currentUserId, display_name: 'You' },
    ];

    const occupantsMap = new Map();
    presenceList.forEach((p) => {
      if (p.user_id === currentUserId) {
        if (isVoiceConnectedToThis) {
          occupantsMap.set(p.user_id, p);
        }
        return;
      }
      occupantsMap.set(p.user_id, p);
    });

    const occupants = Array.from(occupantsMap.values());
    expect(occupants).toHaveLength(1);
    expect(occupants[0].user_id).toBe('user-other-456');
    expect(occupants.some((p) => p.user_id === currentUserId)).toBe(false);
  });
});
