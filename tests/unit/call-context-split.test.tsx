import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import {
  CallStateContext,
  CallActionsContext,
  CallStatsContext,
  CallContext,
  useCallState,
  useCallActions,
  useCallStats,
  useCallContext,
  CallStateContextType,
  CallActionsContextType,
  CallStatsContextType,
  CallContextType,
} from '@/features/calls/call-context';
import { DiagnosticsStats } from '@/components/calls/network-diagnostics';

describe('B2: Split useCallContext & Render Isolation', () => {
  const initialStats: DiagnosticsStats = {
    connectionState: 'connected',
    rttMs: 25,
    jitterMs: 3,
    packetLossPercent: 0,
    incomingBitrateKbps: 64,
    outgoingBitrateKbps: 64,
    transportPath: 'direct_p2p',
  };

  let stateRenderCount = 0;
  let actionsRenderCount = 0;
  let statsRenderCount = 0;
  let fullContextRenderCount = 0;

  beforeEach(() => {
    stateRenderCount = 0;
    actionsRenderCount = 0;
    statsRenderCount = 0;
    fullContextRenderCount = 0;
    vi.restoreAllMocks();
  });

  function StateConsumer() {
    const state = useCallState();
    stateRenderCount++;
    return <div data-testid="state-status">{state.callStatus}</div>;
  }

  function ActionsConsumer() {
    const actions = useCallActions();
    actionsRenderCount++;
    return <button data-testid="toggle-mic-btn" onClick={actions.toggleMic}>Toggle Mic</button>;
  }

  function StatsConsumer() {
    const { stats } = useCallStats();
    statsRenderCount++;
    return <div data-testid="stats-rtt">{stats.rttMs}</div>;
  }

  function FullContextConsumer() {
    const ctx = useCallContext();
    fullContextRenderCount++;
    return <div data-testid="full-status">{ctx.callStatus}</div>;
  }

  function TestProviderHarness({ children }: { children: React.ReactNode }) {
    const [stats, setStats] = React.useState<DiagnosticsStats>(initialStats);

    const callStateValue = React.useMemo<CallStateContextType>(
      () => ({
        callStatus: 'in_call',
        activeConversationId: 'test-conv-1',
        isVideoCall: false,
        isGroupCall: false,
        isLiveKitActive: false,
        isMicMuted: false,
        isDeafened: false,
        isCameraOn: false,
        isScreenSharing: false,
        incomingCall: null,
        localStream: null,
        remoteStream: null,
        screenStream: null,
        participants: [],
        isNoiseSuppressionEnabled: true,
        noiseSuppressionMode: 'balanced',
        peerZeroTierIp: null,
        incomingVolume: 100,
        activeSquadCalls: new Map(),
      }),
      []
    );

    const callActionsValue = React.useMemo<CallActionsContextType>(
      () => ({
        startCall: vi.fn(),
        acceptCall: vi.fn(),
        rejectCall: vi.fn(),
        endCall: vi.fn(),
        restartConnection: vi.fn(),
        toggleMic: vi.fn(),
        toggleDeafen: vi.fn(),
        toggleCamera: vi.fn(),
        toggleScreenShare: vi.fn(),
        broadcastSoundboardClip: vi.fn(),
        toggleNoiseSuppression: vi.fn(),
        setNoiseSuppressionMode: vi.fn(),
        setPeerZeroTierDirectIp: vi.fn(),
        setIncomingVolume: vi.fn(),
        setMicMutedExplicit: vi.fn(),
        setDeafenedExplicit: vi.fn(),
        forceMute: vi.fn(),
        isSquadCallActive: vi.fn(),
        getSquadCallParticipants: vi.fn(),
      }),
      []
    );

    const callStatsValue = React.useMemo<CallStatsContextType>(
      () => ({ stats }),
      [stats]
    );

    const callContextValue = React.useMemo<CallContextType>(
      () => ({
        ...callStateValue,
        ...callActionsValue,
        ...callStatsValue,
      }),
      [callStateValue, callActionsValue, callStatsValue]
    );

    return (
      <CallActionsContext.Provider value={callActionsValue}>
        <CallStateContext.Provider value={callStateValue}>
          <CallStatsContext.Provider value={callStatsValue}>
            <CallContext.Provider value={callContextValue}>
              <button
                data-testid="stats-tick-btn"
                onClick={() =>
                  setStats((prev) => ({
                    ...prev,
                    rttMs: (prev.rttMs || 0) + 10,
                  }))
                }
              >
                Tick Stats
              </button>
              {children}
            </CallContext.Provider>
          </CallStatsContext.Provider>
        </CallStateContext.Provider>
      </CallActionsContext.Provider>
    );
  }

  it('isolates CallStateContext and CallActionsContext: neither re-renders when CallStatsContext updates', () => {
    render(
      <TestProviderHarness>
        <StateConsumer />
        <ActionsConsumer />
        <StatsConsumer />
        <FullContextConsumer />
      </TestProviderHarness>
    );

    // Initial render verification
    expect(stateRenderCount).toBe(1);
    expect(actionsRenderCount).toBe(1);
    expect(statsRenderCount).toBe(1);
    expect(fullContextRenderCount).toBe(1);
    expect(screen.getByTestId('stats-rtt').textContent).toBe('25');

    // Dispatch stats tick (mimicking 2-second network telemetry update)
    const tickBtn = screen.getByTestId('stats-tick-btn');
    act(() => {
      fireEvent.click(tickBtn);
    });

    // Verification after 1st stats tick:
    // 1. StatsConsumer re-rendered to show updated rtt
    expect(screen.getByTestId('stats-rtt').textContent).toBe('35');
    expect(statsRenderCount).toBe(2);

    // 2. StateConsumer and ActionsConsumer DID NOT re-render (isolated!)
    expect(stateRenderCount).toBe(1);
    expect(actionsRenderCount).toBe(1);

    // 3. FullContextConsumer re-rendered (proving why useCallContext was split)
    expect(fullContextRenderCount).toBe(2);

    // Dispatch another stats tick
    act(() => {
      fireEvent.click(tickBtn);
    });

    expect(screen.getByTestId('stats-rtt').textContent).toBe('45');
    expect(statsRenderCount).toBe(3);
    expect(stateRenderCount).toBe(1);
    expect(actionsRenderCount).toBe(1);
    expect(fullContextRenderCount).toBe(3);
  });

  it('warns in console when deprecated useCallContext is invoked in development', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <TestProviderHarness>
        <FullContextConsumer />
      </TestProviderHarness>
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[useCallContext] Deprecated: useCallContext causes re-renders')
    );
  });

  it('throws descriptive error if hooks are called outside provider', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<StateConsumer />)).toThrow(
      'useCallState must be used within a CallProvider'
    );
    expect(() => render(<ActionsConsumer />)).toThrow(
      'useCallActions must be used within a CallProvider'
    );
    expect(() => render(<StatsConsumer />)).toThrow(
      'useCallStats must be used within a CallProvider'
    );
    errorSpy.mockRestore();
  });
});
