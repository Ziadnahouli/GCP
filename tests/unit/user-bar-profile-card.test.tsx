import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockUseAuth = vi.fn();
vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/features/calls/call-context', () => ({
  useCallState: () => ({ callStatus: 'idle', isMicMuted: false, isDeafened: false }),
  useCallActions: () => ({ toggleMic: vi.fn(), toggleDeafen: vi.fn() }),
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

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  }),
}));

import { UserBar } from '@/components/layout/user-bar';

describe('UserBar: Identity Display and Profile Card Trigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders display name and username when profile is loaded', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'usr-42', email: 'gamer@nexus.gg' },
      profile: {
        id: 'usr-42',
        display_name: 'Apex Champion',
        username: 'apex_legend',
        status: 'online',
      },
      updateProfile: vi.fn(),
      signOut: vi.fn(),
    });

    render(<UserBar />);

    expect(screen.getByText('Apex Champion')).toBeDefined();
    expect(screen.getByText('@apex_legend')).toBeDefined();
  });

  it('falls back to auth user metadata when profile is still hydrating', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: 'usr-99',
        email: 'shadow@nexus.gg',
        user_metadata: {
          display_name: 'Shadow Striker',
          username: 'shadow99',
        },
      },
      profile: null,
      updateProfile: vi.fn(),
      signOut: vi.fn(),
    });

    render(<UserBar />);

    expect(screen.getByText('Shadow Striker')).toBeDefined();
    expect(screen.getByText('@shadow99')).toBeDefined();
  });

  it('opens ProfileCard dialog/sheet trigger when user bar is clicked', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'usr-42', email: 'gamer@nexus.gg' },
      profile: {
        id: 'usr-42',
        display_name: 'Apex Champion',
        username: 'apex_legend',
        status: 'online',
      },
      updateProfile: vi.fn(),
      signOut: vi.fn(),
    });

    render(<UserBar />);

    const trigger = screen.getByTitle('View Profile Card');
    expect(trigger).toBeDefined();

    // Clicking the user bar
    fireEvent.click(trigger);

    // Popover / dialog should be triggered with aria-expanded true
    const button = trigger.closest('button');
    expect(button?.getAttribute('aria-expanded')).toBe('true');
  });
});

