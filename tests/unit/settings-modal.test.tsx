import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({
    user: { id: 'user-123', email: 'test@nexus.com' },
    profile: {
      id: 'user-123',
      username: 'gamer_pro',
      display_name: 'Gamer Pro',
      bio: 'Ready to play',
      custom_status: 'In the zone',
      status: 'online',
      banner_color: '#7c3aed',
      avatar_url: '',
    },
    settings: {
      accent_color: 'violet',
      sound_effects_enabled: true,
      push_to_talk_enabled: false,
      input_volume: 85,
      output_volume: 100,
      desktop_notifications: true,
    },
    updateProfile: vi.fn().mockResolvedValue({ error: null }),
    updateSettings: vi.fn().mockResolvedValue({ error: null }),
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
  getLocalDeviceId: () => 'device-123',
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => ({
    channel: () => ({
      on: () => ({
        subscribe: () => ({}),
      }),
    }),
    removeChannel: () => {},
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  }),
}));

import { SettingsModal } from '@/components/layout/settings-modal';

describe('SettingsModal Rendering', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders both navigation sidebar and active tab content', () => {
    const { container } = render(<SettingsModal open={true} onOpenChange={() => {}} />);
    
    // Check sidebar elements
    expect(screen.getByText('Nexus Studio Settings')).toBeDefined();
    expect(screen.getByText('Gamer Profile')).toBeDefined();
    expect(screen.getByText('Themes & Accents')).toBeDefined();

    // Check content area elements for profile tab
    expect(screen.getAllByText(/User Profile/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Live Preview/i)).toBeDefined();
    expect(screen.getAllByText(/Username/i).length).toBeGreaterThan(0);
  });

  const tabs = ['profile', 'appearance', 'studio', 'audio', 'shortcuts', 'notifs', 'security', 'diagnostics'] as const;

  for (const tab of tabs) {
    it(`renders tab "${tab}" without error`, () => {
      render(<SettingsModal open={true} onOpenChange={() => {}} />);
      const tabButton = screen.getByRole('button', {
        name: new RegExp(
          tab === 'profile' ? 'Gamer Profile' :
          tab === 'appearance' ? 'Themes & Accents' :
          tab === 'studio' ? 'Voice & Video Studio' :
          tab === 'audio' ? 'Audio Processing' :
          tab === 'shortcuts' ? 'Shortcuts & Keybinds' :
          tab === 'notifs' ? 'Notifications' :
          tab === 'security' ? 'Security & Privacy' :
          'Diagnostics & Logs',
          'i'
        )
      });
      tabButton.click();
    });
  }

  it('escapes narrow/transformed parent and teleports directly to document.body via portal', () => {
    // Render inside a narrow simulated sidebar container with transform
    const { container } = render(
      <div style={{ width: '240px', transform: 'translateX(0px)', overflow: 'hidden' }}>
        <SettingsModal open={true} onOpenChange={() => {}} />
      </div>
    );

    // The container itself should not contain the dialog elements because of createPortal
    expect(container.querySelector('[role="dialog"]') || container.querySelector('.max-w-5xl')).toBeNull();

    // The dialog should be rendered directly under document.body
    const dialogInBody = document.body.querySelector('.max-w-5xl');
    expect(dialogInBody).not.toBeNull();
    expect(screen.getAllByText(/User Profile/i).length).toBeGreaterThan(0);
  });

  it('renders nothing when open is false', () => {
    render(<SettingsModal open={false} onOpenChange={() => {}} />);
    expect(screen.queryByText('Nexus Studio Settings')).toBeNull();
    expect(screen.queryByText(/User Profile/i)).toBeNull();
  });
});


