export type CallState =
  | 'idle'
  | 'outgoing_ringing'
  | 'incoming_ringing'
  | 'in_call'
  | 'reconnecting'
  | 'ended';

export type CallEvent =
  | 'START_OUTGOING'
  | 'RECEIVE_INCOMING'
  | 'ACCEPT'
  | 'REJECT'
  | 'CONNECT'
  | 'ICE_DISCONNECTED'
  | 'ICE_CONNECTED'
  | 'END_CALL'
  | 'RESET';

export const VALID_TRANSITIONS: Record<CallState, Partial<Record<CallEvent, CallState>>> = {
  idle: {
    START_OUTGOING: 'outgoing_ringing',
    RECEIVE_INCOMING: 'incoming_ringing',
    RESET: 'idle',
  },
  outgoing_ringing: {
    CONNECT: 'in_call',
    END_CALL: 'ended',
    REJECT: 'ended',
    RESET: 'idle',
  },
  incoming_ringing: {
    ACCEPT: 'in_call',
    REJECT: 'ended',
    END_CALL: 'ended',
    RESET: 'idle',
  },
  in_call: {
    ICE_DISCONNECTED: 'reconnecting',
    END_CALL: 'ended',
    RESET: 'idle',
  },
  reconnecting: {
    ICE_CONNECTED: 'in_call',
    CONNECT: 'in_call',
    END_CALL: 'ended',
    RESET: 'idle',
  },
  ended: {
    RESET: 'idle',
    START_OUTGOING: 'outgoing_ringing',
    RECEIVE_INCOMING: 'incoming_ringing',
  },
};

export class CallStateMachine {
  private state: CallState = 'idle';
  private onStateChangeListeners: Array<(state: CallState, prev: CallState) => void> = [];

  constructor(initialState: CallState = 'idle') {
    this.state = initialState;
  }

  getState(): CallState {
    return this.state;
  }

  canTransition(event: CallEvent): boolean {
    const nextState = VALID_TRANSITIONS[this.state]?.[event];
    return nextState !== undefined;
  }

  transition(event: CallEvent): boolean {
    const nextState = VALID_TRANSITIONS[this.state]?.[event];
    if (!nextState) {
      console.warn(`[CallStateMachine] Invalid transition '${event}' from state '${this.state}'`);
      return false;
    }

    const prev = this.state;
    this.state = nextState;
    this.onStateChangeListeners.forEach((listener) => {
      try {
        listener(nextState, prev);
      } catch (err) {
        console.error('[CallStateMachine] Listener error:', err);
      }
    });

    return true;
  }

  onStateChange(listener: (state: CallState, prev: CallState) => void): () => void {
    this.onStateChangeListeners.push(listener);
    return () => {
      const idx = this.onStateChangeListeners.indexOf(listener);
      if (idx !== -1) this.onStateChangeListeners.splice(idx, 1);
    };
  }

  reset(): void {
    this.state = 'idle';
  }
}

/**
 * Checks whether an incoming call or outgoing call creation would collide
 * with an existing active 1-on-1 call, dialing state, or server voice channel (C5).
 */
export function isCallCollision(currentCallState: CallState, isVoiceConnected: boolean): boolean {
  if (isVoiceConnected) return true;
  return currentCallState !== 'idle' && currentCallState !== 'ended';
}
