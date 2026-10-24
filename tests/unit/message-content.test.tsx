import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-servers', () => ({
  useServers: () => ({
    servers: [],
    joinServer: vi.fn().mockResolvedValue({ success: true, server: { id: 's1', name: 'Test Server', channels: [] } }),
  }),
}));

vi.mock('@/features/calls/call-context', () => {
  const mockState = {
    activeConversationId: null,
    callStatus: 'idle',
    activeSquadCalls: new Map(),
  };
  const mockActions = {
    getSquadCallParticipants: vi.fn().mockReturnValue([]),
    isSquadCallActive: vi.fn().mockReturnValue(false),
    startCall: vi.fn(),
    acceptCall: vi.fn(),
  };
  return {
    useCallState: () => mockState,
    useCallActions: () => mockActions,
    useCallStats: () => ({ stats: {} }),
    useCallContext: () => ({ ...mockState, ...mockActions }),
  };
});

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
          in: () => ({
            limit: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  }),
}));

import { MessageContent } from '@/components/chat/message-content';

describe('MessageContent Component (A3 Guard)', () => {
  it('renders safely when content is null without throwing', () => {
    expect(() => {
      render(<MessageContent content={null as any} />);
    }).not.toThrow();
  });

  it('renders safely when content is undefined without throwing', () => {
    expect(() => {
      render(<MessageContent content={undefined as any} />);
    }).not.toThrow();
  });

  it('renders safely when content is an empty string', () => {
    expect(() => {
      render(<MessageContent content="" />);
    }).not.toThrow();
  });

  it('renders plain text content correctly', () => {
    render(<MessageContent content="Hello world from squad" />);
    expect(screen.getByText('Hello world from squad')).toBeInTheDocument();
  });

  it('renders links and server invite tokens safely', () => {
    const inviteId = '11111111-2222-3333-4444-555555555555';
    render(<MessageContent content={`Join our server: /invite/${inviteId}`} />);
    expect(screen.getByText("You've been invited to join a server")).toBeInTheDocument();
  });
});
